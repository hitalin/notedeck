/**
 * HEARTBEAT (#411) — JS 側の scheduler ラッパ。
 *
 * Rust 側 (`commands/heartbeat.rs`) の HeartbeatScheduler に対する薄い接続。
 * 1 つの AI カラム per instance で、global な `aiConfig.heartbeat.enabled` /
 * `intervalMinutes` の変更を watch して自動で configure / unconfigure する。
 *
 * 使い方:
 * ```ts
 * const { triggerNow } = useHeartbeatScheduler(computed(() => props.column.id))
 * ```
 *
 * カラム unmount / heartbeat OFF / interval 変更すべて idempotent に処理する。
 */

import { onScopeDispose, type Ref, watch } from 'vue'
import { isTauri } from '@/utils/settingsFs'
import { commands, unwrap } from '@/utils/tauriInvoke'
import { useAiConfig } from './useAiConfig'

export function useHeartbeatScheduler(columnId: Ref<string>) {
  const { config } = useAiConfig()

  // 失敗時は console.warn だけして continue。Tauri 未起動 (= ブラウザ dev)
  // でも throw しないよう isTauri ガードを入れる。
  // NOTE (#411 daemon 移行中): Rust scheduler は global single になったため
  // column_id 引数は不要。本ファイルは過渡期のシム。次 commit で
  // useHeartbeatDaemon に統合される。
  async function configure(intervalMinutes: number): Promise<void> {
    if (!isTauri) return
    try {
      unwrap(await commands.heartbeatConfigure(intervalMinutes))
    } catch (e) {
      console.warn('[heartbeat] configure failed:', e)
    }
  }

  async function unconfigure(): Promise<void> {
    if (!isTauri) return
    try {
      unwrap(await commands.heartbeatUnconfigure())
    } catch (e) {
      console.warn('[heartbeat] unconfigure failed:', e)
    }
  }

  /**
   * Manual trigger (= 「💓 今すぐ実行」ボタン)。enabled 状態に関係なく
   * 即座に 1 回 tick を emit する。
   */
  async function triggerNow(): Promise<void> {
    if (!isTauri) return
    try {
      unwrap(await commands.heartbeatTriggerNow())
    } catch (e) {
      console.warn('[heartbeat] trigger_now failed:', e)
    }
  }

  // 過渡期: 各 AI カラムが個別に configure/unconfigure を呼ぶ
  // (= 最後に呼んだカラムの interval が global scheduler に反映される)。
  // 次 commit で App-level daemon 1 つに集約する。
  watch(
    () => ({
      enabled: config.value.heartbeat.enabled,
      interval: config.value.heartbeat.intervalMinutes,
    }),
    async (next) => {
      if (!columnId.value) return
      if (next.enabled) {
        await configure(next.interval)
      } else {
        await unconfigure()
      }
    },
    { immediate: true, deep: true },
  )

  // カラム unmount / scope dispose 時は global scheduler を停止
  // (過渡期実装のため、複数 AI カラムが開いている場合は最後の 1 つが
  // 閉じるまで daemon が止まらないことに注意)
  onScopeDispose(async () => {
    await unconfigure()
  })

  return { triggerNow }
}
