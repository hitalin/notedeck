import { onUnmounted, type Ref } from 'vue'

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'

export function useFocusTrap(
  containerRef: Ref<HTMLElement | null>,
  options: {
    initialFocus?: string
    restoreFocus?: boolean
    onEscape?: () => void
  } = {},
) {
  let previousFocus: HTMLElement | null = null
  let active = false

  function getFocusableElements(): HTMLElement[] {
    const el = containerRef.value
    if (!el) return []
    return Array.from(el.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
      (node) => node.offsetParent !== null,
    )
  }

  function onKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      e.preventDefault()
      e.stopPropagation()
      options.onEscape?.()
      return
    }

    if (e.key !== 'Tab') return

    const focusable = getFocusableElements()
    if (focusable.length === 0) {
      e.preventDefault()
      return
    }

    const first = focusable[0] as HTMLElement | undefined
    const last = focusable[focusable.length - 1] as HTMLElement | undefined
    if (!first || !last) return

    if (e.shiftKey) {
      if (document.activeElement === first) {
        e.preventDefault()
        last.focus()
      }
    } else {
      if (document.activeElement === last) {
        e.preventDefault()
        first.focus()
      }
    }
  }

  function activate() {
    const el = containerRef.value
    if (!el || active) return

    active = true
    previousFocus = document.activeElement as HTMLElement | null
    el.addEventListener('keydown', onKeydown)

    if (options.initialFocus) {
      const target = el.querySelector<HTMLElement>(options.initialFocus)
      if (target) {
        target.focus()
        return
      }
    }

    const focusable = getFocusableElements()
    focusable[0]?.focus()
  }

  function deactivate() {
    const el = containerRef.value
    if (!active) return

    active = false
    el?.removeEventListener('keydown', onKeydown)

    if ((options.restoreFocus ?? true) && previousFocus) {
      previousFocus.focus()
      previousFocus = null
    }
  }

  onUnmounted(deactivate)

  return { activate, deactivate }
}
