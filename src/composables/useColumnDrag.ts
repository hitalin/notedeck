import { ref } from 'vue'
import type { useDeckStore } from '@/stores/deck'

type DeckStore = ReturnType<typeof useDeckStore>

const DRAG_THRESHOLD = 5

export function useColumnDrag(deckStore: DeckStore) {
  const dragColumnId = ref<string | null>(null)
  const dropTarget = ref<{
    columnId: string
    position: 'swap' | 'above' | 'below'
  } | null>(null)

  let ghost: HTMLElement | null = null

  function startDrag(columnId: string, e: PointerEvent) {
    if (e.button !== 0) return
    const target = e.target as HTMLElement
    if (target.closest('button')) return

    const sx = e.clientX
    const sy = e.clientY

    function onMove(ev: PointerEvent) {
      const dx = ev.clientX - sx
      const dy = ev.clientY - sy
      if (dx * dx + dy * dy < DRAG_THRESHOLD * DRAG_THRESHOLD) return
      document.removeEventListener('pointermove', onMove)
      document.removeEventListener('pointerup', onCancel)
      beginDrag(columnId, ev)
    }

    function onCancel() {
      document.removeEventListener('pointermove', onMove)
      document.removeEventListener('pointerup', onCancel)
    }

    document.addEventListener('pointermove', onMove)
    document.addEventListener('pointerup', onCancel)
  }

  function beginDrag(columnId: string, e: PointerEvent) {
    dragColumnId.value = columnId

    const sourceEl = document.querySelector(
      `.column-section[data-column-id="${CSS.escape(columnId)}"]`,
    )
    const header = sourceEl?.querySelector(
      '.column-header',
    ) as HTMLElement | null
    if (header) {
      ghost = header.cloneNode(true) as HTMLElement
      Object.assign(ghost.style, {
        position: 'fixed',
        zIndex: '10000',
        pointerEvents: 'none',
        opacity: '0.8',
        width: `${header.clientWidth}px`,
        transform: 'scale(0.95)',
        boxShadow: '0 8px 24px rgba(0,0,0,0.3)',
        borderRadius: '8px',
        overflow: 'hidden',
      })
      document.body.appendChild(ghost)
    }

    moveGhost(e.clientX, e.clientY)
    document.body.style.userSelect = 'none'
    document.body.style.cursor = 'grabbing'

    document.addEventListener('pointermove', onDragMove)
    document.addEventListener('pointerup', onDragEnd)
  }

  function moveGhost(x: number, y: number) {
    if (!ghost) return
    ghost.style.left = `${x - ghost.offsetWidth / 2}px`
    ghost.style.top = `${y - 10}px`
  }

  function onDragMove(e: PointerEvent) {
    moveGhost(e.clientX, e.clientY)

    // Hide ghost for hit detection
    if (ghost) ghost.style.display = 'none'
    const el = document.elementFromPoint(e.clientX, e.clientY)
    if (ghost) ghost.style.display = ''

    if (!el) {
      dropTarget.value = null
      return
    }

    const section = el.closest('[data-column-id]') as HTMLElement | null
    if (!section) {
      dropTarget.value = null
      return
    }

    const targetId = section.dataset.columnId
    if (!targetId || targetId === dragColumnId.value) {
      dropTarget.value = null
      return
    }

    const rect = section.getBoundingClientRect()
    const relY = (e.clientY - rect.top) / rect.height

    let position: 'swap' | 'above' | 'below'
    if (relY < 0.25) {
      position = 'above'
    } else if (relY > 0.75) {
      position = 'below'
    } else {
      position = 'swap'
    }

    dropTarget.value = { columnId: targetId, position }
  }

  function onDragEnd() {
    document.removeEventListener('pointermove', onDragMove)
    document.removeEventListener('pointerup', onDragEnd)

    if (dropTarget.value && dragColumnId.value) {
      const { columnId: targetId, position } = dropTarget.value
      const dragId = dragColumnId.value
      const fromIdx = deckStore.layout.findIndex((ids) => ids.includes(dragId))
      const toIdx = deckStore.layout.findIndex((ids) => ids.includes(targetId))

      if (position === 'swap' && fromIdx >= 0 && toIdx >= 0) {
        deckStore.swapColumns(fromIdx, toIdx)
      } else if (position === 'above' || position === 'below') {
        deckStore.stackColumn(dragId, targetId, position)
      }
    }

    // Cleanup
    dragColumnId.value = null
    dropTarget.value = null
    if (ghost) {
      ghost.remove()
      ghost = null
    }
    document.body.style.userSelect = ''
    document.body.style.cursor = ''
  }

  return { dragColumnId, dropTarget, startDrag }
}
