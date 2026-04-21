/**
 * UserActivityHeatmap.vue 用の純粋関数群。
 * テスト可能にするためコンポーネントから分離。
 */

/** 幅から表示週数と aspectRatio を決定 (本家 MkHeatmap.vue の分岐) */
export function getWeeksConfig(width: number): {
  weeks: 10 | 25 | 50
  aspectRatio: 1.8 | 3.2 | 6
} {
  if (width > 700) return { weeks: 50, aspectRatio: 6 }
  if (width < 400) return { weeks: 10, aspectRatio: 1.8 }
  return { weeks: 25, aspectRatio: 3.2 }
}

/**
 * `inc` 配列を matrix 用データに整形する。
 * 本家と同じく配列 index 0 = 今日、index i = 今日から i 日前。
 */
export function formatMatrixData(
  values: number[],
  now: Date = new Date(),
): { x: string; y: number; d: string; v: number }[] {
  const y0 = now.getFullYear()
  const m0 = now.getMonth()
  const d0 = now.getDate()
  return values.map((v, i) => {
    const dt = new Date(y0, m0, d0 - i)
    const iso = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`
    return { x: iso, y: dt.getDay(), d: iso, v }
  })
}

/** 本家と同じく上位 3 値の平均を max、最小値-1 を min (0 以上) とする */
export function computeMaxMin(values: number[]): { max: number; min: number } {
  if (values.length === 0) return { max: 1, min: 0 }
  const sorted = [...values].sort((a, b) => b - a)
  const top = sorted.slice(0, 3)
  const max = top.length > 0 ? top.reduce((a, b) => a + b, 0) / top.length : 1
  const min = Math.max(0, Math.min(...values) - 1)
  return { max: max === 0 ? 1 : max, min }
}
