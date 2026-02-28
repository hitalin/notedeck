import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import type { TimelineFilter, TimelineType } from '@/adapters/types'
import { useAccountsStore } from '@/stores/accounts'

export type ColumnType = 'timeline' | 'notifications' | 'search' | 'list' | 'antenna' | 'favorites' | 'clip' | 'user' | 'mentions' | 'channel' | 'specified'

export interface DeckColumn {
  id: string
  type: ColumnType
  name: string | null
  width: number
  accountId: string | null
  tl?: TimelineType
  query?: string
  active?: boolean
  filters?: TimelineFilter
  listId?: string
  antennaId?: string
  clipId?: string
  channelId?: string
  userId?: string
}

let columnCounter = 0
function genColumnId(): string {
  return `col-${Date.now()}-${++columnCounter}`
}

export const useDeckStore = defineStore('deck', () => {
  const columns = ref<DeckColumn[]>([])
  const layout = ref<string[][]>([])
  const navCollapsed = ref(false)
  const activeColumnId = ref<string | null>(null)

  function setActiveColumn(id: string) {
    activeColumnId.value = id
  }

  const activeColumnUri = computed(() => {
    if (!activeColumnId.value) return null
    const col = columns.value.find((c) => c.id === activeColumnId.value)
    if (!col || !col.accountId) return null

    const accountsStore = useAccountsStore()
    const account = accountsStore.accounts.find(
      (a) => a.id === col.accountId,
    )
    if (!account) return null

    const host = account.host
    switch (col.type) {
      case 'timeline':
        return `notedeck://${host}/timeline/${col.tl ?? 'home'}`
      case 'notifications':
        return `notedeck://${host}/notifications`
      case 'search':
        return `notedeck://${host}/search${col.query ? `?q=${col.query}` : ''}`
      case 'list':
        return `notedeck://${host}/list/${col.listId}`
      case 'antenna':
        return `notedeck://${host}/antenna/${col.antennaId}`
      case 'favorites':
        return `notedeck://${host}/favorites`
      case 'clip':
        return `notedeck://${host}/clip/${col.clipId}`
      case 'channel':
        return `notedeck://${host}/channel/${col.channelId}`
      case 'user':
        return `notedeck://${host}/user/${col.userId}`
      case 'mentions':
        return `notedeck://${host}/mentions`
      case 'specified':
        return `notedeck://${host}/direct`
      default:
        return null
    }
  })

  function addColumn(partial: Omit<DeckColumn, 'id'>) {
    const col: DeckColumn = { ...partial, id: genColumnId() }
    columns.value.push(col)
    layout.value.push([col.id])
    save()
    return col
  }

  function removeColumn(id: string) {
    columns.value = columns.value.filter((c) => c.id !== id)
    layout.value = layout.value
      .map((ids) => ids.filter((_id) => _id !== id))
      .filter((ids) => ids.length > 0)
    save()
  }

  function updateColumn(id: string, updates: Partial<DeckColumn>) {
    const col = columns.value.find((c) => c.id === id)
    if (col) {
      Object.assign(col, updates)
      save()
    }
  }

  function swapColumns(aIdx: number, bIdx: number) {
    if (
      aIdx < 0 ||
      bIdx < 0 ||
      aIdx >= layout.value.length ||
      bIdx >= layout.value.length
    )
      return
    const newLayout = [...layout.value]
    const a = newLayout[aIdx]
    const b = newLayout[bIdx]
    if (!a || !b) return
    newLayout[aIdx] = b
    newLayout[bIdx] = a
    layout.value = newLayout
    save()
  }

  function moveLeft(id: string) {
    const idx = layout.value.findIndex((ids) => ids.includes(id))
    if (idx > 0) swapColumns(idx, idx - 1)
  }

  function moveRight(id: string) {
    const idx = layout.value.findIndex((ids) => ids.includes(id))
    if (idx < layout.value.length - 1) swapColumns(idx, idx + 1)
  }

  function getColumn(id: string): DeckColumn | undefined {
    return columns.value.find((c) => c.id === id)
  }

  let saveTimer: ReturnType<typeof setTimeout> | null = null
  function save() {
    if (saveTimer) return
    saveTimer = setTimeout(() => {
      saveTimer = null
      try {
        localStorage.setItem(
          'nd-deck',
          JSON.stringify({ columns: columns.value, layout: layout.value }),
        )
      } catch (e) {
        console.warn('[deck] failed to save:', e)
      }
    }, 100)
  }

  function load() {
    try {
      const raw = localStorage.getItem('nd-deck')
      if (!raw) return
      const data = JSON.parse(raw)
      if (data.columns && data.layout) {
        columns.value = data.columns
        layout.value = data.layout
      }
    } catch (e) {
      console.warn('[deck] failed to load:', e)
    }
  }

  function clear() {
    columns.value = []
    layout.value = []
    save()
  }

  return {
    columns,
    layout,
    navCollapsed,
    activeColumnId,
    activeColumnUri,
    setActiveColumn,
    addColumn,
    removeColumn,
    updateColumn,
    swapColumns,
    moveLeft,
    moveRight,
    getColumn,
    save,
    load,
    clear,
  }
})
