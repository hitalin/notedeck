import { type Ref, watch } from 'vue'

const SLIDE_CLASSES = ['nd-tab-slide-left', 'nd-tab-slide-right'] as const

/**
 * Enter-only slide animation for tab switching.
 *
 * Content switches immediately, then the new content slides in
 * from the appropriate direction. No delayed midpoint switching needed.
 */
export function useTabSlide(
  tabIndex: Ref<number>,
  contentRef: Ref<HTMLElement | null>,
) {
  let prev: number | undefined
  let pendingCleanup: (() => void) | null = null

  watch(
    tabIndex,
    (cur) => {
      const el = contentRef.value
      if (!el || prev === undefined || cur === prev) {
        prev = cur
        return
      }

      // Cancel any pending animation
      if (pendingCleanup) {
        pendingCleanup()
        pendingCleanup = null
      }

      const forward = cur > prev
      prev = cur

      const cls = forward ? 'nd-tab-slide-left' : 'nd-tab-slide-right'

      // Clear any swipe state that might conflict (snap-back in progress, etc.)
      el.classList.remove('nd-tab-swiping', 'nd-tab-snap-back')
      el.style.removeProperty('--nd-swipe')

      // Start the enter animation on new content
      el.classList.remove(...SLIDE_CLASSES)
      void el.offsetWidth
      el.classList.add(cls)

      // Clean up class when animation ends
      const onEnd = () => {
        el.classList.remove(cls)
        pendingCleanup = null
      }
      el.addEventListener('animationend', onEnd, { once: true })

      pendingCleanup = () => {
        el.removeEventListener('animationend', onEnd)
        el.classList.remove(...SLIDE_CLASSES)
      }
    },
    { flush: 'sync' },
  )
}
