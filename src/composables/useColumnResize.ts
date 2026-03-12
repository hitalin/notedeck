import type { Ref } from 'vue'
import { ref } from 'vue'
import type { DeckColumn, useDeckStore } from '@/stores/deck'

const COL_MIN_WIDTH = 280
const COL_MAX_WIDTH = 600

const WIDE_COLUMN_TYPES: ReadonlySet<string> = new Set(['apiDocs'])

export function useColumnResize(
  columnMap: Ref<Map<string, DeckColumn>>,
  deckStore: ReturnType<typeof useDeckStore>,
) {
  const resizingColId = ref<string | null>(null)
  const resizingColStartX = ref(0)
  const resizingColStartW = ref(0)

  function getColMaxWidth(colId: string): number {
    const col = columnMap.value.get(colId)
    return col && WIDE_COLUMN_TYPES.has(col.type) ? 1200 : COL_MAX_WIDTH
  }

  function onColumnResize(e: MouseEvent) {
    if (!resizingColId.value) return
    const delta = e.clientX - resizingColStartX.value
    const maxW = getColMaxWidth(resizingColId.value)
    const newW = Math.max(
      COL_MIN_WIDTH,
      Math.min(resizingColStartW.value + delta, maxW),
    )
    deckStore.updateColumn(resizingColId.value, { width: newW })
  }

  function stopColumnResize() {
    resizingColId.value = null
    document.body.style.userSelect = ''
    document.body.style.cursor = ''
    document.removeEventListener('mousemove', onColumnResize)
    document.removeEventListener('mouseup', stopColumnResize)
  }

  function startColumnResize(colId: string, e: MouseEvent) {
    e.preventDefault()
    const col = columnMap.value.get(colId)
    if (!col) return
    resizingColId.value = colId
    resizingColStartX.value = e.clientX
    resizingColStartW.value = col.width
    document.body.style.userSelect = 'none'
    document.body.style.cursor = 'col-resize'
    document.addEventListener('mousemove', onColumnResize)
    document.addEventListener('mouseup', stopColumnResize)
  }

  return {
    resizingColId,
    startColumnResize,
    WIDE_COLUMN_TYPES,
  }
}
