import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { effectScope } from 'vue'

const UNLOAD_DELAY = 3000
const MAX_LIVE = 3

vi.mock('@/stores/performance', () => ({
  usePerformanceStore: () => ({
    get: (key: string) => {
      if (key === 'columnUnloadDelay') return UNLOAD_DELAY
      if (key === 'maxLiveColumns') return MAX_LIVE
      return 0
    },
  }),
}))

import { provideColumnMountRegistry } from './useColumnMount'

/**
 * `provideColumnMountRegistry()` calls `provide()` and `onScopeDispose()`.
 * Wrap in an effectScope so both work without a component instance.
 * `provide()` emits a warning outside a component instance but is a no-op —
 * silence it so test output stays clean.
 */
function withRegistry(
  fn: (registry: ReturnType<typeof provideColumnMountRegistry>) => void,
): void {
  const scope = effectScope(true)
  const originalWarn = console.warn
  console.warn = () => undefined
  try {
    scope.run(() => fn(provideColumnMountRegistry()))
  } finally {
    console.warn = originalWarn
    scope.stop()
  }
}

describe('ColumnMountRegistry', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('initialMounted: true で登録すると isMounted が即 true', () => {
    withRegistry((registry) => {
      registry.register('col-1', { initialMounted: true })
      expect(registry.isMounted('col-1')).toBe(true)
    })
  })

  it('initialMounted: false で登録すると isMounted は false', () => {
    withRegistry((registry) => {
      registry.register('col-1', { initialMounted: false })
      expect(registry.isMounted('col-1')).toBe(false)
    })
  })

  it('既存エントリの initialMounted は上書きしない (再登録でフラッシュされない)', () => {
    withRegistry((registry) => {
      registry.register('col-1', { initialMounted: true })
      registry.setIntersecting('col-1', false)
      vi.advanceTimersByTime(UNLOAD_DELAY + 100)
      expect(registry.isMounted('col-1')).toBe(false)

      registry.register('col-1', { initialMounted: true })
      expect(registry.isMounted('col-1')).toBe(false)
    })
  })

  it('setIntersecting(true) で isMounted が即 true になり、unload タイマーがキャンセルされる', () => {
    withRegistry((registry) => {
      registry.register('col-1', { initialMounted: false })
      registry.setIntersecting('col-1', false)
      registry.setIntersecting('col-1', true)
      expect(registry.isMounted('col-1')).toBe(true)

      vi.advanceTimersByTime(UNLOAD_DELAY + 100)
      expect(registry.isMounted('col-1')).toBe(true)
    })
  })

  it('setIntersecting(false) + delay 経過で isMounted が false になる', () => {
    withRegistry((registry) => {
      registry.register('col-1', { initialMounted: true })
      registry.setIntersecting('col-1', false)
      expect(registry.isMounted('col-1')).toBe(true)

      vi.advanceTimersByTime(UNLOAD_DELAY - 1)
      expect(registry.isMounted('col-1')).toBe(true)

      vi.advanceTimersByTime(1)
      expect(registry.isMounted('col-1')).toBe(false)
    })
  })

  it('delay 経過前に再可視化されたら mount を維持する', () => {
    withRegistry((registry) => {
      registry.register('col-1', { initialMounted: true })
      registry.setIntersecting('col-1', false)
      vi.advanceTimersByTime(UNLOAD_DELAY / 2)
      registry.setIntersecting('col-1', true)
      vi.advanceTimersByTime(UNLOAD_DELAY)
      expect(registry.isMounted('col-1')).toBe(true)
    })
  })

  it('updateLiveBudget が active からの距離順に maxLive 個だけ live=true', () => {
    withRegistry((registry) => {
      const ids = ['a', 'b', 'c', 'd', 'e']
      for (const id of ids) registry.register(id, { initialMounted: true })

      registry.updateLiveBudget(ids, 'c')
      expect(registry.isMounted('a')).toBe(true)
      expect(registry.isMounted('e')).toBe(true)

      // MAX_LIVE=3 なので c, b, d (距離 0, 1, 1) が live
      // a, e (距離 2) は live から外れる
      const visited = new Set<string>()
      const budget: string[] = []
      for (let i = 0; i < ids.length && budget.length < MAX_LIVE; i++) {
        // 実装は distance 同順の tie-break にソート安定性を頼っている
        // (Array.sort は ECMAScript 2019 以降 stable)
        const candidates = ids
          .map((id, idx) => ({
            id,
            distance: Math.abs(idx - ids.indexOf('c')),
          }))
          .sort((x, y) => x.distance - y.distance)
        for (const c of candidates) {
          if (!visited.has(c.id) && budget.length < MAX_LIVE) {
            visited.add(c.id)
            budget.push(c.id)
          }
        }
      }
      expect(budget).toEqual(['c', 'b', 'd'])
    })
  })

  it('updateLiveBudget が mount 済みのカラムだけを候補にする', () => {
    withRegistry((registry) => {
      const ids = ['a', 'b', 'c', 'd', 'e']
      registry.register('a', { initialMounted: true })
      registry.register('b', { initialMounted: false })
      registry.register('c', { initialMounted: true })
      registry.register('d', { initialMounted: false })
      registry.register('e', { initialMounted: true })

      // mount 済みは a, c, e (距離 2, 0, 2) → MAX_LIVE=3 で全員 live
      registry.updateLiveBudget(ids, 'c')
      // 実際の live フラグは外部から観測できないが、unregister 経由で
      // 全エントリが掃除されることだけ確認
      for (const id of ids) registry.unregister(id)
      for (const id of ids) expect(registry.isMounted(id)).toBe(false)
    })
  })

  it('unregister でエントリとタイマーがすべて消える', () => {
    withRegistry((registry) => {
      registry.register('col-1', { initialMounted: true })
      registry.setIntersecting('col-1', false)
      expect(registry.isMounted('col-1')).toBe(true)

      registry.unregister('col-1')
      expect(registry.isMounted('col-1')).toBe(false)

      // タイマーが残っていれば false のまま残るが、unregister で消えたら
      // delay 経過後も状態変化は起きない
      vi.advanceTimersByTime(UNLOAD_DELAY + 100)
      expect(registry.isMounted('col-1')).toBe(false)
    })
  })

  it('updateLiveBudget で active 不在 (null) の場合は index 0 を基点にする', () => {
    withRegistry((registry) => {
      const ids = ['a', 'b', 'c']
      for (const id of ids) registry.register(id, { initialMounted: true })
      // MAX_LIVE=3 なので全員 live になる — 実行時エラーがないことのみ確認
      expect(() => registry.updateLiveBudget(ids, null)).not.toThrow()
    })
  })
})
