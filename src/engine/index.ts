/**
 * Gaming CSS Engine v2 — エントリーポイント。
 *
 * ゲームエンジンの概念を WebView + CSS + TypeScript 制約下に再構成:
 * - ブラウザの GPU コンポジタ = レンダリングバックエンド
 * - CSS = シェーダー言語
 * - DOM = シーングラフ
 * - RAF = ゲームループ
 */

export {
  type AnimationTier,
  type FramePhase,
  type FrameStats,
  frameEngine,
} from './frameEngine'

export { frameTelemetry, type QualityLevel } from './telemetry/frameTelemetry'
