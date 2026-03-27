import { onScopeDispose } from 'vue'

import { type FramePhase, frameEngine } from '@/engine/frameEngine'

/**
 * Frame-aware priority scheduler — Gaming CSS Engine の共通基盤。
 *
 * Gaming CSS v2: Frame Engine の Vue composable ラッパー。
 * 既存の API (high/normal/idle) を維持しつつ、統一 RAF ループにルーティングする。
 *
 * - high:   Frame Engine の 'input' phase（ユーザー入力応答）
 * - normal: Frame Engine の 'write' phase（ストリーミング、DOM更新）
 * - idle:   Frame Engine の 'idle' phase（プリフェッチ、キャッシュ更新）
 */
export type FramePriority = 'high' | 'normal' | 'idle'

/** Map legacy priority names to Frame Engine phases. */
const PHASE_MAP: Record<FramePriority, FramePhase> = {
  high: 'input',
  normal: 'write',
  idle: 'idle',
}

export function useFrameScheduler() {
  const tracked = new Set<() => void>()

  function schedule(fn: () => void, priority: FramePriority = 'normal'): void {
    tracked.add(fn)
    frameEngine.schedule(PHASE_MAP[priority], fn)
  }

  function cancel(fn: () => void): void {
    tracked.delete(fn)
    frameEngine.cancel(fn)
  }

  function dispose() {
    for (const fn of tracked) {
      frameEngine.cancel(fn)
    }
    tracked.clear()
  }

  onScopeDispose(dispose)

  return { schedule, cancel, dispose }
}
