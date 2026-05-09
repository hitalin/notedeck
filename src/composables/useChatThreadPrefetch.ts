/**
 * チャット履歴 thread の prefetch ジョブ (#460 Phase B-6)。
 *
 * Misskey `chat/history` API は各 thread の最新 1 件しか返さない仕様のため、
 * history view を表示しただけでは「ユーザーが過去に開いたことのある thread」
 * 以外は最新 1 件しか cache に蓄積されない。本 composable は history view を
 * 表示したタイミングで各 thread の messages を `untilId` pagination で
 * 取り切れるまで取得し、`chat_messages_cache` を埋める。これによりログアウト
 * 後 / オフライン状態でも全 thread の履歴をローカルだけで読めるようになる。
 *
 * - 既に DB に閾値以上ある thread は skip (= 過去に prefetch 済)
 * - 1 thread あたり `untilId` で page 単位に過去に遡り、空 page か上限到達で打ち切り
 * - 並列度を絞ってサーバ負荷を抑える (sliding window)
 * - 失敗は黙って無視 (UI に出さない)
 * - `chat.cacheEnabled = false` のときは全 skip
 * - 件数の上限は notecli の `chat_messages_cache` per-account cap (default 1M) に任せる
 */
import type { ChatMessage } from '@/adapters/types'
import { useMultiAccountAdapters } from '@/composables/useMultiAccountAdapters'
import { useSettingsStore } from '@/stores/settings'
import { commands, unwrap } from '@/utils/tauriInvoke'

export interface PrefetchTarget {
  accountId: string
  isRoom: boolean
  /** isRoom=true なら roomId, false なら other userId */
  targetId: string
}

/** 1 page あたりの fetch 件数 (Misskey 推奨上限)。 */
const PAGE_SIZE = 100
/** 並列度 (sliding window)。 */
const PREFETCH_CONCURRENCY = 3
/** 1 thread あたり最大 page 数 (= 100 × 100 = 10,000 件で打ち切り)。 */
const MAX_PAGES_PER_THREAD = 100
/**
 * 既にこの件数以上 cache に入っていれば「prefetch 済」と判断して skip。
 * 単発の WS event だけで 2 件溜まるケースもあるが、その場合は次回 prefetch で
 * 完全 fetch されるので問題ない。
 */
const SKIP_IF_AT_LEAST = 2

export function useChatThreadPrefetch() {
  const settingsStore = useSettingsStore()
  const multiAdapters = useMultiAccountAdapters()

  async function prefetchOne(target: PrefetchTarget): Promise<void> {
    const threadId = target.isRoom
      ? `r:${target.targetId}`
      : `u:${target.targetId}`
    try {
      const cached = unwrap(
        await commands.apiGetCachedChatThreadMessages(
          target.accountId,
          threadId,
          null,
          SKIP_IF_AT_LEAST,
        ),
      )
      if (cached.length >= SKIP_IF_AT_LEAST) return

      const adapter = await multiAdapters.getOrCreate(target.accountId)
      if (!adapter) return

      // `untilId` pagination で全件取得。Misskey API は created_at 降順で
      // 返すので、配列末尾 (= 最古 message) の id を次の untilId にする。
      // 空配列 / PAGE_SIZE 未満 / 同じ untilId の繰り返し / 上限 page 数 で打ち切り。
      let untilId: string | undefined
      for (let page = 0; page < MAX_PAGES_PER_THREAD; page++) {
        const fetched: ChatMessage[] = target.isRoom
          ? await adapter.api.getChatRoomMessages(target.targetId, {
              limit: PAGE_SIZE,
              untilId,
              cache: true,
            })
          : await adapter.api.getChatUserMessages(target.targetId, {
              limit: PAGE_SIZE,
              untilId,
              cache: true,
            })

        if (fetched.length === 0) break
        const oldest: ChatMessage | undefined = fetched[fetched.length - 1]
        if (!oldest) break
        // 同じ id がループしたら脱出 (防御コード: API が誤って同じ page を返した場合)
        if (oldest.id === untilId) break
        untilId = oldest.id
        // 1 page 未満 = 末尾に到達
        if (fetched.length < PAGE_SIZE) break
      }
    } catch {
      // prefetch は best-effort。trace ログも残さない (大量 thread で雑音になる)。
    }
  }

  /**
   * targets を並列度 PREFETCH_CONCURRENCY で sliding-window 実行する。
   * 全部の prefetch が完了するまで resolve しないが、呼び出し側は
   * await せずに fire-and-forget で良い。
   */
  async function prefetch(targets: PrefetchTarget[]): Promise<void> {
    if (settingsStore.get('chat.cacheEnabled') === false) return
    if (targets.length === 0) return

    const queue = targets.slice()
    const workers = Array.from(
      { length: Math.min(PREFETCH_CONCURRENCY, queue.length) },
      async () => {
        while (queue.length > 0) {
          const next = queue.shift()
          if (next) await prefetchOne(next)
        }
      },
    )
    await Promise.all(workers)
  }

  return { prefetch }
}
