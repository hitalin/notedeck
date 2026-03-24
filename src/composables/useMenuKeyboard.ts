import { onUnmounted, type Ref } from 'vue'

export function useMenuKeyboard(options: {
  containerRef: Ref<HTMLElement | null>
  itemSelector: string
  onClose: () => void
}) {
  const { containerRef, itemSelector, onClose } = options
  let active = false

  function getItems(): HTMLElement[] {
    const el = containerRef.value
    if (!el) return []
    return Array.from(el.querySelectorAll<HTMLElement>(itemSelector)).filter(
      (node) => node.offsetParent !== null && !node.hasAttribute('disabled'),
    )
  }

  function currentIndex(): number {
    const items = getItems()
    return items.indexOf(document.activeElement as HTMLElement)
  }

  function focusItem(index: number) {
    const items = getItems()
    if (items.length === 0) return
    const clamped = Math.max(0, Math.min(index, items.length - 1))
    items[clamped].focus()
  }

  function onKeydown(e: KeyboardEvent) {
    switch (e.key) {
      case 'ArrowDown': {
        e.preventDefault()
        const idx = currentIndex()
        focusItem(idx < 0 ? 0 : idx + 1)
        break
      }
      case 'ArrowUp': {
        e.preventDefault()
        const items = getItems()
        const idx = currentIndex()
        focusItem(idx < 0 ? items.length - 1 : idx - 1)
        break
      }
      case 'Home': {
        e.preventDefault()
        focusItem(0)
        break
      }
      case 'End': {
        e.preventDefault()
        focusItem(getItems().length - 1)
        break
      }
      case 'Escape': {
        e.preventDefault()
        e.stopPropagation()
        onClose()
        break
      }
    }
  }

  function activate() {
    const el = containerRef.value
    if (!el || active) return
    active = true
    el.addEventListener('keydown', onKeydown)
    focusItem(0)
  }

  function deactivate() {
    const el = containerRef.value
    if (!active) return
    active = false
    el?.removeEventListener('keydown', onKeydown)
  }

  onUnmounted(deactivate)

  return { activate, deactivate }
}
