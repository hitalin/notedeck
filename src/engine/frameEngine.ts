/**
 * Frame Engine — Gaming CSS v2 の中核。
 *
 * ゲームエンジンの「単一レンダーループ」を WebView 上に再現する。
 * 全ての DOM 読み書き・アニメーション・アイドル処理を 1 つの RAF ループに統合し、
 * フェーズ別のフレーム予算管理で 60fps (16.6ms) を維持する。
 *
 * フェーズ実行順序:
 *   1. input   — ポインタ状態の flush (< 2ms)
 *   2. animate — JS 駆動アニメーション tick (< 4ms)
 *   3. read    — バッチ DOM 測定 (getBoundingClientRect 等)
 *   4. write   — バッチ DOM 変更 (style, class 更新)
 *   5. idle    — 残余時間で低優先度処理
 */

export type AnimationTier = 'critical' | 'normal' | 'cosmetic'
export type FramePhase = 'input' | 'animate' | 'read' | 'write' | 'idle'

interface QueueEntry {
  fn: () => void
  tier: AnimationTier
}

const PHASE_ORDER: readonly FramePhase[] = [
  'input',
  'animate',
  'read',
  'write',
  'idle',
]

const IDLE_TIMEOUT_MS = 2000

const _idle: (cb: IdleRequestCallback) => number =
  typeof window !== 'undefined' && window.requestIdleCallback
    ? (cb) => window.requestIdleCallback(cb, { timeout: IDLE_TIMEOUT_MS })
    : (cb) => window.setTimeout(cb, IDLE_TIMEOUT_MS) as unknown as number

const _cancelIdle: (id: number) => void =
  typeof window !== 'undefined' && window.cancelIdleCallback
    ? (id) => window.cancelIdleCallback(id)
    : (id) => window.clearTimeout(id)

/** Detect display refresh rate for frame budget calculation. */
function detectFrameBudget(): number {
  // Default to 60fps (16.6ms). Could be refined with frame time measurement.
  return 16.6
}

function createQueues(): Record<FramePhase, QueueEntry[]> {
  return { input: [], animate: [], read: [], write: [], idle: [] }
}

class FrameEngineImpl {
  private _queues: Record<FramePhase, QueueEntry[]> = createQueues()
  private _rafId: number | null = null
  private _idleIds = new Set<number>()
  private _running = false

  // --- Telemetry ---
  private _frameStart = 0
  private _lastFrameTime = 0
  private _isOverBudget = false
  readonly frameBudget = detectFrameBudget()

  // --- EMA for continuous monitoring ---
  private _frameTimeEma = 16.6
  private _jankCount = 0
  private _frameCount = 0
  private _lastJankReset = 0

  // --- Listeners ---
  private _onFrameListeners: ((stats: FrameStats) => void)[] = []

  get lastFrameTime(): number {
    return this._lastFrameTime
  }

  get isOverBudget(): boolean {
    return this._isOverBudget
  }

  get frameTimeEma(): number {
    return this._frameTimeEma
  }

  get jankCount(): number {
    return this._jankCount
  }

  /**
   * Schedule work into a specific phase of the next frame.
   *
   * @param phase - Which phase to execute in
   * @param fn - The work to execute
   * @param tier - Priority tier (only relevant for 'animate' phase).
   *              'cosmetic' work is skipped when over budget.
   */
  schedule(
    phase: FramePhase,
    fn: () => void,
    tier: AnimationTier = 'normal',
  ): void {
    if (phase === 'idle') {
      const id = _idle(() => {
        this._idleIds.delete(id)
        fn()
      })
      this._idleIds.add(id)
      return
    }
    this._queues[phase].push({ fn, tier })
    this._ensureRaf()
  }

  /**
   * Cancel a previously scheduled function.
   */
  cancel(fn: () => void): void {
    for (const phase of PHASE_ORDER) {
      const queue = this._queues[phase]
      for (let i = queue.length - 1; i >= 0; i--) {
        if (queue[i].fn === fn) {
          queue.splice(i, 1)
        }
      }
    }
  }

  /**
   * Register a listener that fires after each frame with stats.
   */
  onFrame(listener: (stats: FrameStats) => void): () => void {
    this._onFrameListeners.push(listener)
    return () => {
      const idx = this._onFrameListeners.indexOf(listener)
      if (idx !== -1) this._onFrameListeners.splice(idx, 1)
    }
  }

  /**
   * Start the engine. Called once at app init.
   */
  start(): void {
    if (this._running) return
    this._running = true
    this._lastJankReset = performance.now()
  }

  /**
   * Stop the engine and cancel all pending work.
   */
  stop(): void {
    this._running = false
    if (this._rafId !== null) {
      cancelAnimationFrame(this._rafId)
      this._rafId = null
    }
    this._queues = createQueues()
    for (const id of this._idleIds) _cancelIdle(id)
    this._idleIds.clear()
  }

  private _ensureRaf(): void {
    if (this._rafId === null && this._running) {
      this._rafId = requestAnimationFrame((ts) => this._tick(ts))
    }
  }

  private _tick(_timestamp: number): void {
    this._rafId = null
    this._frameStart = performance.now()

    // Execute phases in order
    for (const phase of PHASE_ORDER) {
      if (phase === 'idle') {
        this._flushIdle()
      } else {
        this._flushPhase(phase)
      }
    }

    // Measure frame time
    const elapsed = performance.now() - this._frameStart
    this._lastFrameTime = elapsed
    this._isOverBudget = elapsed > this.frameBudget

    // Update EMA (alpha = 0.2 for smooth tracking)
    this._frameTimeEma = 0.2 * elapsed + 0.8 * this._frameTimeEma

    // Jank detection: frame took > 2x budget (33ms at 60fps)
    this._frameCount++
    if (elapsed > this.frameBudget * 2) {
      this._jankCount++
    }

    // Reset jank counter every second
    const now = performance.now()
    if (now - this._lastJankReset >= 1000) {
      this._notifyListeners()
      this._jankCount = 0
      this._frameCount = 0
      this._lastJankReset = now
    }

    // Re-schedule if there's pending work
    if (this._hasPendingWork()) {
      this._ensureRaf()
    }
  }

  private _flushPhase(phase: FramePhase): void {
    const queue = this._queues[phase]
    if (queue.length === 0) return
    const entries = queue.splice(0)

    for (const entry of entries) {
      // Skip cosmetic work when over budget (animate phase only)
      if (
        phase === 'animate' &&
        entry.tier === 'cosmetic' &&
        this._isOverBudget
      ) {
        // Re-queue for next frame
        queue.push(entry)
        continue
      }
      entry.fn()
    }
  }

  private _flushIdle(): void {
    const queue = this._queues.idle
    if (queue.length === 0) return

    const remaining = this.frameBudget - (performance.now() - this._frameStart)
    if (remaining < 1) return // No budget left

    // Run as many idle tasks as we can within remaining budget
    while (queue.length > 0) {
      const elapsed = performance.now() - this._frameStart
      if (elapsed >= this.frameBudget - 1) break // Leave 1ms margin
      const entry = queue.shift()
      if (entry) entry.fn()
    }
  }

  private _hasPendingWork(): boolean {
    for (const phase of PHASE_ORDER) {
      if (phase === 'idle') continue
      if (this._queues[phase].length > 0) return true
    }
    return false
  }

  private _notifyListeners(): void {
    if (this._onFrameListeners.length === 0) return
    const stats: FrameStats = {
      fps: this._frameCount,
      frameTimeEma: this._frameTimeEma,
      jankCount: this._jankCount,
      lastFrameTime: this._lastFrameTime,
    }
    for (const listener of this._onFrameListeners) {
      listener(stats)
    }
  }
}

/** Per-second frame statistics emitted to listeners. */
export interface FrameStats {
  /** Frames rendered in the last second */
  fps: number
  /** Exponential moving average of frame time (ms) */
  frameTimeEma: number
  /** Number of janky frames (> 33ms) in the last second */
  jankCount: number
  /** Last frame's execution time (ms) */
  lastFrameTime: number
}

/** Singleton frame engine instance. */
export const frameEngine = new FrameEngineImpl()
