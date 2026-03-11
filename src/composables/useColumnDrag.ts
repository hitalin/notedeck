import { ref } from 'vue'
import type { useDeckStore } from '@/stores/deck'

type DeckStore = ReturnType<typeof useDeckStore>

const DRAG_THRESHOLD = 5

type DropTarget =
  | { columnId: string; position: 'swap' | 'above' | 'below' }
  | { insertIndex: number; position: 'insert' }

export function useColumnDrag(deckStore: DeckStore) {
  const dragColumnId = ref<string | null>(null)
  const dropTarget = ref<DropTarget | null>(null)

  let ghost: HTMLElement | null = null

  function startDrag(columnId: string, e: PointerEvent) {
    if (e.button !== 0) return
    const target = e.target as HTMLElement
    if (target.closest('button')) return

    e.preventDefault()

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
      `.stack-cell[data-column-id="${CSS.escape(columnId)}"]`,
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

    // Check if hovering over a column
    const cell = el.closest('[data-column-id]') as HTMLElement | null
    if (cell) {
      const targetId = cell.dataset.columnId
      if (!targetId || targetId === dragColumnId.value) {
        dropTarget.value = null
        return
      }

      // Same group — only swap is meaningful (no nested stacking)
      const dragId = dragColumnId.value
      const sameGroup =
        dragId &&
        deckStore.layout.some(
          (ids) => ids.includes(dragId) && ids.includes(targetId),
        )

      if (sameGroup) {
        dropTarget.value = { columnId: targetId, position: 'swap' }
      } else {
        const rect = cell.getBoundingClientRect()
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
      return
    }

    // Helper: inserting at fromIdx or fromIdx+1 is a no-op (same position)
    function isInsertNoop(insertIndex: number): boolean {
      const dragId = dragColumnId.value
      if (!dragId) return false
      const fromIdx = deckStore.layout.findIndex((ids) => ids.includes(dragId))
      return (
        fromIdx >= 0 && (insertIndex === fromIdx || insertIndex === fromIdx + 1)
      )
    }

    // Check if hovering over a resize handle or gap between columns
    const handle = el.closest('.col-resize-handle') as HTMLElement | null
    if (handle) {
      const sections = [
        ...document.querySelectorAll('.column-section'),
      ] as HTMLElement[]
      const handleRect = handle.getBoundingClientRect()
      const handleCenter = handleRect.left + handleRect.width / 2

      // Find which section is to the left of this handle
      let insertIndex = sections.length
      for (let i = 0; i < sections.length; i++) {
        const sRect = sections[i]?.getBoundingClientRect()
        if (sRect && sRect.left > handleCenter) {
          insertIndex = i
          break
        }
      }

      dropTarget.value = isInsertNoop(insertIndex)
        ? null
        : { insertIndex, position: 'insert' }
      return
    }

    // Check if hovering over empty area within the columns container
    const columnsContainer = el.closest('.columns') as HTMLElement | null
    if (columnsContainer) {
      const sections = [
        ...columnsContainer.querySelectorAll(':scope > .column-section'),
      ] as HTMLElement[]

      // Determine insert position from cursor X
      let insertIndex = sections.length
      for (let i = 0; i < sections.length; i++) {
        const sRect = sections[i]?.getBoundingClientRect()
        if (sRect && e.clientX < sRect.left + sRect.width / 2) {
          insertIndex = i
          break
        }
      }

      dropTarget.value = isInsertNoop(insertIndex)
        ? null
        : { insertIndex, position: 'insert' }
      return
    }

    dropTarget.value = null
  }

  function onDragEnd() {
    document.removeEventListener('pointermove', onDragMove)
    document.removeEventListener('pointerup', onDragEnd)

    if (dropTarget.value && dragColumnId.value) {
      const dragId = dragColumnId.value

      if (dropTarget.value.position === 'insert') {
        // Drop between columns — unstack / move to position
        deckStore.insertColumnAt(dragId, dropTarget.value.insertIndex)
      } else {
        const { columnId: targetId, position } = dropTarget.value
        const fromIdx = deckStore.layout.findIndex((ids) =>
          ids.includes(dragId),
        )
        const toIdx = deckStore.layout.findIndex((ids) =>
          ids.includes(targetId),
        )

        if (position === 'swap') {
          if (fromIdx === toIdx && fromIdx >= 0) {
            // Same group — swap within group
            deckStore.swapInGroup(dragId, targetId)
          } else if (fromIdx >= 0 && toIdx >= 0) {
            // Different groups — swap entire groups
            deckStore.swapColumns(fromIdx, toIdx)
          }
        } else if (position === 'above' || position === 'below') {
          deckStore.stackColumn(dragId, targetId, position)
        }
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
