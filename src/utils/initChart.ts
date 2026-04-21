/**
 * Chart.js のグローバル登録。heatmap 用の最小セットのみ。
 * heatmap コンポーネントの冒頭で side-effect import することで遅延登録される。
 *
 * 将来 bar / line chart を追加する際は必要な controller/element をここに追記。
 */
import { CategoryScale, Chart, LinearScale, TimeScale, Tooltip } from 'chart.js'
import 'chartjs-adapter-date-fns'
import { MatrixController, MatrixElement } from 'chartjs-chart-matrix'

let registered = false

if (!registered) {
  Chart.register(
    MatrixController,
    MatrixElement,
    TimeScale,
    CategoryScale,
    LinearScale,
    Tooltip,
  )
  Chart.defaults.animation = false
  registered = true
}

/**
 * Misskey 本家 MkHeatmap.vue の固定ブランドカラーに合わせる
 * (テーマ CSS 変数ではない、本家と同じ固定値)。
 */
export function getHeatmapColor(isDark: boolean): string {
  return isDark ? '#b4e900' : '#86b300'
}

/**
 * #RRGGBB を rgba(r, g, b, a) に変換する。Misskey の alpha() 相当。
 */
export function applyAlpha(hex: string, alpha: number): string {
  const h = hex.replace('#', '')
  const r = Number.parseInt(h.slice(0, 2), 16)
  const g = Number.parseInt(h.slice(2, 4), 16)
  const b = Number.parseInt(h.slice(4, 6), 16)
  const a = Math.max(0, Math.min(1, alpha))
  return `rgba(${r}, ${g}, ${b}, ${a})`
}
