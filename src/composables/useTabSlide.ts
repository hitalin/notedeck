import { type Ref, ref, watch } from 'vue'

const SLIDE_CLASSES = ['nd-tab-slide-left', 'nd-tab-slide-right'] as const

/**
 * Fused out-in slide animation for tab switching.
 *
 * Uses a single CSS keyframe that covers both leave and enter phases,
 * eliminating any gap between them:
 *
 *   0%  → old content visible
 *  40%  → faded out (old content hidden)
 *  50%  → still hidden, content switches here via `displayedIndex`
 * 100%  → new content visible
 *
 * Returns `displayedIndex` — use it for v-if / content rendering.
 */
export function useTabSlide(
  tabIndex: Ref<number>,
  contentRef: Ref<HTMLElement | null>,
) {
  // --nd-duration-slower = 0.3s; midpoint = 45% ≈ 135ms
  const SWITCH_DELAY = 135

  const displayedIndex = ref(tabIndex.value)
  let prev: number | undefined
  let pendingCleanup: (() => void) | null = null

  watch(
    tabIndex,
    (cur) => {
      const el = contentRef.value
      if (!el || prev === undefined || cur === prev) {
        prev = cur
        displayedIndex.value = cur
        return
      }

      // Cancel any pending transition
      if (pendingCleanup) {
        pendingCleanup()
        pendingCleanup = null
      }

      const forward = cur > prev
      prev = cur

      const cls = forward ? 'nd-tab-slide-left' : 'nd-tab-slide-right'

      // Start the fused animation
      el.classList.remove(...SLIDE_CLASSES)
      void el.offsetWidth
      el.classList.add(cls)

      // Switch content at the midpoint (opacity is 0 here)
      const switchTimer = setTimeout(() => {
        displayedIndex.value = cur
      }, SWITCH_DELAY)

      // Clean up class when animation ends
      const onEnd = () => el.classList.remove(cls)
      el.addEventListener('animationend', onEnd, { once: true })

      pendingCleanup = () => {
        clearTimeout(switchTimer)
        el.removeEventListener('animationend', onEnd)
        el.classList.remove(...SLIDE_CLASSES)
        displayedIndex.value = cur
      }
    },
    { flush: 'sync' },
  )

  return { displayedIndex }
}
