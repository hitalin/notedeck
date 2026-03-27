import { onScopeDispose } from 'vue'

/**
 * Frame-aware priority scheduler — Gaming CSS Engine の共通基盤。
 *
 * ゲームエンジンの「フレーム予算管理」を Vue composable として提供。
 * 既存の個別 RAF パターン (useStreamingBatch, notes.ts 等) と同じ原理を汎用化。
 *
 * - high:   次の RAF 先頭で実行（ユーザー入力応答）
 * - normal: 次の RAF で high の後に実行（ストリーミング、アニメーション）
 * - idle:   requestIdleCallback で実行（プリフェッチ、キャッシュ更新）
 */
export type FramePriority = 'high' | 'normal' | 'idle'

const IDLE_TIMEOUT_MS = 2000

const _idle: (cb: IdleRequestCallback) => number =
  typeof window !== 'undefined' && window.requestIdleCallback
    ? (cb) => window.requestIdleCallback(cb, { timeout: IDLE_TIMEOUT_MS })
    : (cb) => window.setTimeout(cb, IDLE_TIMEOUT_MS) as unknown as number

const _cancelIdle: (id: number) => void =
  typeof window !== 'undefined' && window.cancelIdleCallback
    ? (id) => window.cancelIdleCallback(id)
    : (id) => window.clearTimeout(id)

export function useFrameScheduler() {
  const highQueue: (() => void)[] = []
  const normalQueue: (() => void)[] = []
  let rafId: number | null = null
  const idleIds = new Set<number>()

  function flushFrame() {
    rafId = null
    // High priority first
    const high = highQueue.splice(0)
    for (const fn of high) fn()
    // Then normal
    const normal = normalQueue.splice(0)
    for (const fn of normal) fn()
  }

  function ensureRaf() {
    if (rafId === null) {
      rafId = requestAnimationFrame(flushFrame)
    }
  }

  function schedule(fn: () => void, priority: FramePriority = 'normal'): void {
    if (priority === 'idle') {
      const id = _idle(() => {
        idleIds.delete(id)
        fn()
      })
      idleIds.add(id)
      return
    }
    const queue = priority === 'high' ? highQueue : normalQueue
    queue.push(fn)
    ensureRaf()
  }

  function cancel(fn: () => void): void {
    let idx = highQueue.indexOf(fn)
    if (idx !== -1) {
      highQueue.splice(idx, 1)
      return
    }
    idx = normalQueue.indexOf(fn)
    if (idx !== -1) {
      normalQueue.splice(idx, 1)
    }
  }

  function dispose() {
    if (rafId !== null) {
      cancelAnimationFrame(rafId)
      rafId = null
    }
    highQueue.length = 0
    normalQueue.length = 0
    for (const id of idleIds) _cancelIdle(id)
    idleIds.clear()
  }

  onScopeDispose(dispose)

  return { schedule, cancel, dispose }
}
