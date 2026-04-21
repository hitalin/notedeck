import { describe, expect, it } from 'vitest'
import {
  computeMaxMin,
  formatMatrixData,
  getWeeksConfig,
} from './userActivityHeatmap.utils'

describe('getWeeksConfig', () => {
  it('幅 > 700 で 50 週 / aspectRatio 6 を返す', () => {
    expect(getWeeksConfig(701)).toEqual({ weeks: 50, aspectRatio: 6 })
  })

  it('幅 < 400 で 10 週 / aspectRatio 1.8 を返す', () => {
    expect(getWeeksConfig(399)).toEqual({ weeks: 10, aspectRatio: 1.8 })
  })

  it('400 以上 700 以下で 25 週 / aspectRatio 3.2 を返す', () => {
    expect(getWeeksConfig(500)).toEqual({ weeks: 25, aspectRatio: 3.2 })
    expect(getWeeksConfig(400)).toEqual({ weeks: 25, aspectRatio: 3.2 })
    expect(getWeeksConfig(700)).toEqual({ weeks: 25, aspectRatio: 3.2 })
  })
})

describe('formatMatrixData', () => {
  const now = new Date(2026, 3, 21) // 2026-04-21 (Tue)

  it('index 0 を今日にマッピングする', () => {
    const result = formatMatrixData([5, 3, 1], now)
    expect(result[0]).toEqual({ x: '2026-04-21', y: 2, d: '2026-04-21', v: 5 })
  })

  it('index i を今日から i 日前にマッピングする', () => {
    const result = formatMatrixData([0, 0, 0], now)
    expect(result[1]?.d).toBe('2026-04-20') // 月曜
    expect(result[1]?.y).toBe(1)
    expect(result[2]?.d).toBe('2026-04-19') // 日曜
    expect(result[2]?.y).toBe(0)
  })

  it('月またぎを正しく扱う', () => {
    const startOfMonth = new Date(2026, 4, 1) // 2026-05-01
    const result = formatMatrixData([0, 0], startOfMonth)
    expect(result[0]?.d).toBe('2026-05-01')
    expect(result[1]?.d).toBe('2026-04-30')
  })

  it('値をそのまま v に渡す', () => {
    const result = formatMatrixData([7, 0, 42], now)
    expect(result.map((r) => r.v)).toEqual([7, 0, 42])
  })
})

describe('computeMaxMin', () => {
  it('上位 3 値の平均を max とする', () => {
    const { max } = computeMaxMin([1, 2, 3, 4, 5, 6, 10])
    // 上位 3 は [10, 6, 5], 平均は 7
    expect(max).toBe(7)
  })

  it('値が 3 個未満でも動作する', () => {
    const { max } = computeMaxMin([10, 2])
    // 上位 2 の平均 = 6
    expect(max).toBe(6)
  })

  it('最小値 - 1 を min とするが、0 未満にはしない', () => {
    expect(computeMaxMin([3, 5, 10]).min).toBe(2)
    expect(computeMaxMin([0, 0, 5]).min).toBe(0)
  })

  it('空配列では max=1 min=0 を返す', () => {
    expect(computeMaxMin([])).toEqual({ max: 1, min: 0 })
  })

  it('全て 0 の配列では max=1 (ゼロ除算回避)', () => {
    expect(computeMaxMin([0, 0, 0, 0]).max).toBe(1)
  })
})
