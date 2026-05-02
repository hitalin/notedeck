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
  async function configure(id: string, intervalMinutes: number): Promise<void> {
    if (!isTauri) return
    try {
      unwrap(await commands.heartbeatConfigure(id, intervalMinutes))
    } catch (e) {
      console.warn('[heartbeat] configure failed:', e)
    }
  }

  async function unconfigure(id: string): Promise<void> {
    if (!isTauri) return
    try {
      unwrap(await commands.heartbeatUnconfigure(id))
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
      unwrap(await commands.heartbeatTriggerNow(columnId.value))
    } catch (e) {
      console.warn('[heartbeat] trigger_now failed:', e)
    }
  }

  // 設定変更を Rust に push。columnId が変わったら old を必ず unregister。
  watch(
    () => ({
      enabled: config.value.heartbeat.enabled,
      interval: config.value.heartbeat.intervalMinutes,
      id: columnId.value,
    }),
    async (next, prev) => {
      // columnId が変わるケース (= 通常は無いが) は old を先に unregister
      if (prev?.id && prev.id !== next.id) {
        await unconfigure(prev.id)
      }
      if (!next.id) return
      if (next.enabled) {
        await configure(next.id, next.interval)
      } else {
        await unconfigure(next.id)
      }
    },
    { immediate: true, deep: true },
  )

  // カラム unmount / scope dispose 時は必ず unregister
  onScopeDispose(async () => {
    if (columnId.value) {
      await unconfigure(columnId.value)
    }
  })

  return { triggerNow }
}
