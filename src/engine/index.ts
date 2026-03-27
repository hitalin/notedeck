/**
 * Rendering Performance Engine — エントリーポイント。
 *
 * DOM read/write のバッチングとフレーム予算管理で Layout Thrashing を回避し、
 * Jank 検出に基づく CSS 品質の自動調整で安定した描画を維持する。
 */

export {
  type AnimationTier,
  type FramePhase,
  type FrameStats,
  frameEngine,
} from './frameEngine'

export { frameTelemetry, type QualityLevel } from './telemetry/frameTelemetry'
