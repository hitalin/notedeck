import { beforeEach, describe, expect, it, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useDeckStore } from '@/stores/deck'

// Mock localStorage
const storage = new Map<string, string>()
vi.stubGlobal('localStorage', {
  getItem: (key: string) => storage.get(key) ?? null,
  setItem: (key: string, value: string) => storage.set(key, value),
  removeItem: (key: string) => storage.delete(key),
})

describe('deck store', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    storage.clear()
  })

  it('addColumn creates a column and updates layout', () => {
    const deck = useDeckStore()

    const col = deck.addColumn({
      type: 'timeline',
      name: 'Home',
      width: 400,
      accountId: 'acc1',
      tl: 'home',
    })

    expect(deck.columns).toHaveLength(1)
    expect(deck.columns[0]!.id).toBe(col.id)
    expect(deck.layout).toEqual([[col.id]])
  })

  it('removeColumn removes column and layout entry', () => {
    const deck = useDeckStore()
    const col = deck.addColumn({ type: 'timeline', name: null, width: 400, accountId: null })

    deck.removeColumn(col.id)

    expect(deck.columns).toHaveLength(0)
    expect(deck.layout).toHaveLength(0)
  })

  it('updateColumn modifies column properties', () => {
    const deck = useDeckStore()
    const col = deck.addColumn({ type: 'timeline', name: 'Old', width: 400, accountId: null })

    deck.updateColumn(col.id, { name: 'New', width: 500 })

    expect(deck.getColumn(col.id)?.name).toBe('New')
    expect(deck.getColumn(col.id)?.width).toBe(500)
  })

  it('swapColumns swaps layout positions', () => {
    const deck = useDeckStore()
    const col1 = deck.addColumn({ type: 'timeline', name: 'A', width: 400, accountId: null })
    const col2 = deck.addColumn({ type: 'timeline', name: 'B', width: 400, accountId: null })

    deck.swapColumns(0, 1)

    expect(deck.layout[0]).toEqual([col2.id])
    expect(deck.layout[1]).toEqual([col1.id])
  })

  it('moveLeft moves column one position left', () => {
    const deck = useDeckStore()
    const col1 = deck.addColumn({ type: 'timeline', name: 'A', width: 400, accountId: null })
    const col2 = deck.addColumn({ type: 'timeline', name: 'B', width: 400, accountId: null })

    deck.moveLeft(col2.id)

    expect(deck.layout[0]).toEqual([col2.id])
    expect(deck.layout[1]).toEqual([col1.id])
  })

  it('moveRight moves column one position right', () => {
    const deck = useDeckStore()
    const col1 = deck.addColumn({ type: 'timeline', name: 'A', width: 400, accountId: null })
    const col2 = deck.addColumn({ type: 'timeline', name: 'B', width: 400, accountId: null })

    deck.moveRight(col1.id)

    expect(deck.layout[0]).toEqual([col2.id])
    expect(deck.layout[1]).toEqual([col1.id])
  })

  it('does not move past boundaries', () => {
    const deck = useDeckStore()
    const col1 = deck.addColumn({ type: 'timeline', name: 'A', width: 400, accountId: null })
    const col2 = deck.addColumn({ type: 'timeline', name: 'B', width: 400, accountId: null })

    deck.moveLeft(col1.id)  // already leftmost
    deck.moveRight(col2.id) // already rightmost

    expect(deck.layout[0]).toEqual([col1.id])
    expect(deck.layout[1]).toEqual([col2.id])
  })

  it('save/load persists state to localStorage', () => {
    const deck = useDeckStore()
    const col = deck.addColumn({ type: 'timeline', name: 'Test', width: 400, accountId: 'acc1' })

    // Create a new store instance and load
    setActivePinia(createPinia())
    const deck2 = useDeckStore()
    deck2.load()

    expect(deck2.columns).toHaveLength(1)
    expect(deck2.columns[0]!.id).toBe(col.id)
    expect(deck2.layout).toEqual([[col.id]])
  })

  it('clear removes all columns and layout', () => {
    const deck = useDeckStore()
    deck.addColumn({ type: 'timeline', name: 'A', width: 400, accountId: null })
    deck.addColumn({ type: 'notifications', name: 'B', width: 400, accountId: null })

    deck.clear()

    expect(deck.columns).toHaveLength(0)
    expect(deck.layout).toHaveLength(0)
  })
})
