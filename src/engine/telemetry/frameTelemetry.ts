/**
 * Frame Telemetry — 継続的パフォーマンス監視と自動品質調整。
 *
 * Frame Engine から毎秒フレーム統計を受信し、以下を行う:
 * - P95 フレーム時間の追跡
 * - Jank 連続検出による品質自動ダウングレード
 * - 安定時の品質アップグレード試行
 * - Performance Store との双方向連携
 */

import { readonly, ref } from 'vue'
import { type FrameStats, frameEngine } from '../frameEngine'

export type QualityLevel = 'low' | 'balanced' | 'high'

/** Default thresholds for automatic quality adjustment. */
const DEFAULT_JANK_DOWNGRADE_THRESHOLD = 5
const DEFAULT_STABLE_UPGRADE_SECONDS = 10
const FRAME_HISTORY_SIZE = 100 // ring buffer for P95 calculation

const QUALITY_ORDER: QualityLevel[] = ['low', 'balanced', 'high']

class FrameTelemetryImpl {
  // --- Reactive state (exposed as readonly refs) ---
  private _fps = ref(60)
  private _frameTimeEma = ref(16.6)
  private _p95FrameTime = ref(16.6)
  private _jankCount = ref(0)
  private _currentQuality = ref<QualityLevel>('balanced')
  private _autoAdjustEnabled = ref(true)

  // --- Internal state ---
  private _frameTimeHistory: number[] = []
  private _historyIndex = 0
  private _stableSeconds = 0
  private _historySize = FRAME_HISTORY_SIZE
  private _unsubscribe: (() => void) | null = null
  private _onQualityChange: ((quality: QualityLevel) => void) | null = null
  private _jankThreshold = DEFAULT_JANK_DOWNGRADE_THRESHOLD
  private _stableTarget = DEFAULT_STABLE_UPGRADE_SECONDS

  // --- Public readonly refs ---
  readonly fps = readonly(this._fps)
  readonly frameTimeEma = readonly(this._frameTimeEma)
  readonly p95FrameTime = readonly(this._p95FrameTime)
  readonly jankCount = readonly(this._jankCount)
  readonly currentQuality = readonly(this._currentQuality)
  readonly autoAdjustEnabled = readonly(this._autoAdjustEnabled)

  /**
   * Start telemetry collection.
   * @param initialQuality - Current quality from Performance Store
   * @param onQualityChange - Callback when auto-adjustment changes quality
   */
  start(
    initialQuality: QualityLevel,
    onQualityChange?: (quality: QualityLevel) => void,
    options?: {
      jankDowngradeThreshold?: number
      stableUpgradeSeconds?: number
      frameHistorySize?: number
    },
  ): void {
    this._jankThreshold =
      options?.jankDowngradeThreshold ?? DEFAULT_JANK_DOWNGRADE_THRESHOLD
    this._stableTarget =
      options?.stableUpgradeSeconds ?? DEFAULT_STABLE_UPGRADE_SECONDS
    this._historySize = options?.frameHistorySize ?? FRAME_HISTORY_SIZE
    this._currentQuality.value = initialQuality
    this._onQualityChange = onQualityChange ?? null
    this._frameTimeHistory = new Array(this._historySize).fill(16.6)
    this._historyIndex = 0
    this._stableSeconds = 0

    this._unsubscribe = frameEngine.onFrame((stats) => this._handleFrame(stats))
  }

  /**
   * Stop telemetry collection.
   */
  stop(): void {
    this._unsubscribe?.()
    this._unsubscribe = null
  }

  /**
   * Enable/disable automatic quality adjustment.
   */
  setAutoAdjust(enabled: boolean): void {
    this._autoAdjustEnabled.value = enabled
    this._stableSeconds = 0
  }

  /**
   * Manually set quality (e.g., from user preset selection).
   */
  setQuality(quality: QualityLevel): void {
    this._currentQuality.value = quality
    this._stableSeconds = 0
  }

  private _handleFrame(stats: FrameStats): void {
    // Update reactive state
    this._fps.value = stats.fps
    this._frameTimeEma.value = stats.frameTimeEma
    this._jankCount.value = stats.jankCount

    // Record frame time in ring buffer
    this._frameTimeHistory[this._historyIndex] = stats.frameTimeEma
    this._historyIndex = (this._historyIndex + 1) % this._historySize

    // Calculate P95
    this._p95FrameTime.value = this._calculateP95()

    // Auto quality adjustment
    if (this._autoAdjustEnabled.value) {
      this._evaluateQuality(stats)
    }
  }

  private _calculateP95(): number {
    const sorted = [...this._frameTimeHistory].sort((a, b) => a - b)
    const idx = Math.floor(sorted.length * 0.95)
    return sorted[idx] ?? 16.6
  }

  private _evaluateQuality(stats: FrameStats): void {
    const currentIdx = QUALITY_ORDER.indexOf(this._currentQuality.value)

    // Downgrade: too many janks
    if (stats.jankCount > this._jankThreshold && currentIdx > 0) {
      const newQuality = QUALITY_ORDER[currentIdx - 1]
      if (newQuality) {
        this._currentQuality.value = newQuality
        this._stableSeconds = 0
        this._onQualityChange?.(newQuality)
      }
      return
    }

    // Upgrade: stable for N seconds
    if (stats.jankCount === 0) {
      this._stableSeconds++
      if (
        this._stableSeconds >= this._stableTarget &&
        currentIdx < QUALITY_ORDER.length - 1
      ) {
        const newQuality = QUALITY_ORDER[currentIdx + 1]
        if (newQuality) {
          this._currentQuality.value = newQuality
          this._stableSeconds = 0
          this._onQualityChange?.(newQuality)
        }
      }
    } else {
      this._stableSeconds = 0
    }
  }
}

/** Singleton telemetry instance. */
export const frameTelemetry = new FrameTelemetryImpl()
