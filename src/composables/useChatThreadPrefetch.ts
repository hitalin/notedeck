/**
 * チャット履歴 thread の prefetch ジョブ (#460 Phase B-6)。
 *
 * Misskey `chat/history` API は各 thread の最新 1 件しか返さない仕様のため、
 * history view を表示しただけでは「ユーザーが過去に開いたことのある thread」
 * 以外は最新 1 件しか cache に蓄積されない。本 composable は history view を
 * 表示したタイミングで各 thread の messages を裏で取得し、
 * `chat_messages_cache` を埋める。UI は変更しない (透過 cache に乗せるだけ)。
 *
 * - 既に DB に 2 件以上ある thread は skip (= 過去に開いた / 既に prefetch 済)
 * - 並列度を 3 に絞ってサーバ負荷を抑える
 * - 失敗は黙って無視 (UI に出さない)
 * - `chat.cacheEnabled = false` のアカウント / グローバル設定では全 skip
 */
import { useMultiAccountAdapters } from '@/composables/useMultiAccountAdapters'
import { useSettingsStore } from '@/stores/settings'
import { commands, unwrap } from '@/utils/tauriInvoke'

export interface PrefetchTarget {
  accountId: string
  isRoom: boolean
  /** isRoom=true なら roomId, false なら other userId */
  targetId: string
}

const PREFETCH_LIMIT = 20
const PREFETCH_CONCURRENCY = 3
/** 既にこの件数以上 cache に入っていれば prefetch skip。 */
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

      if (target.isRoom) {
        await adapter.api.getChatRoomMessages(target.targetId, {
          limit: PREFETCH_LIMIT,
          cache: true,
        })
      } else {
        await adapter.api.getChatUserMessages(target.targetId, {
          limit: PREFETCH_LIMIT,
          cache: true,
        })
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
