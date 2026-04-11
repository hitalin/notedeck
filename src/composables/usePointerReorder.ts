import { onScopeDispose, ref } from 'vue'

export interface PointerReorderOptions {
  /** data-* attribute name on draggable elements (e.g. 'nav-idx' → data-nav-idx). */
  dataAttr: string
  /** Minimum pointer movement (px) before drag begins. Default: 5. */
  threshold?: number
  /** Called when a valid reorder occurs. */
  onReorder: (fromIndex: number, toIndex: number) => void
}

export function usePointerReorder(options: PointerReorderOptions) {
  const { dataAttr, threshold = 5, onReorder } = options

  const dragFromIndex = ref<number | null>(null)
  const dragOverIndex = ref<number | null>(null)

  const camelAttr = dataAttr.replace(/-([a-z])/g, (_, c: string) =>
    c.toUpperCase(),
  )

  /** threshold判定中のリスナーをクリーンアップする関数 */
  let cleanupPending: (() => void) | null = null

  function startDrag(index: number, e: PointerEvent) {
    if (e.button !== 0) return
    const target = e.target as HTMLElement
    if (target.closest('button')) return

    // 前回の threshold 判定中リスナーが残っていたらクリーンアップ
    cleanupPending?.()

    e.preventDefault()
    const startX = e.clientX
    const startY = e.clientY

    function cleanup() {
      document.removeEventListener('pointermove', onMove)
      document.removeEventListener('pointerup', onCancel)
      cleanupPending = null
    }

    function onMove(ev: PointerEvent) {
      const dx = ev.clientX - startX
      const dy = ev.clientY - startY
      if (Math.abs(dx) + Math.abs(dy) < threshold) return
      cleanup()
      beginDrag(index)
    }

    function onCancel() {
      cleanup()
    }

    cleanupPending = cleanup
    document.addEventListener('pointermove', onMove)
    document.addEventListener('pointerup', onCancel)
  }

  function beginDrag(index: number) {
    dragFromIndex.value = index
    document.body.style.userSelect = 'none'
    document.body.style.cursor = 'grabbing'
    document.addEventListener('pointermove', onDragMove)
    document.addEventListener('pointerup', onDragEnd)
  }

  function onDragMove(e: PointerEvent) {
    const el = document.elementFromPoint(e.clientX, e.clientY)
    if (!el) {
      dragOverIndex.value = null
      return
    }
    const card = el.closest(`[data-${dataAttr}]`) as HTMLElement | null
    if (card) {
      const idx = Number(card.dataset[camelAttr])
      dragOverIndex.value = idx !== dragFromIndex.value ? idx : null
    } else {
      dragOverIndex.value = null
    }
  }

  function onDragEnd() {
    document.removeEventListener('pointermove', onDragMove)
    document.removeEventListener('pointerup', onDragEnd)
    document.body.style.userSelect = ''
    document.body.style.cursor = ''

    const fromIdx = dragFromIndex.value
    const toIdx = dragOverIndex.value
    dragFromIndex.value = null
    dragOverIndex.value = null

    if (fromIdx == null || toIdx == null || fromIdx === toIdx) return
    onReorder(fromIdx, toIdx)
  }

  onScopeDispose(() => {
    cleanupPending?.()
    if (dragFromIndex.value != null) onDragEnd()
  })

  return {
    dragFromIndex,
    dragOverIndex,
    startDrag,
  }
}
