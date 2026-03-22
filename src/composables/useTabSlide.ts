import { type Ref, watch } from 'vue'

/**
 * Apply a directional slide-in animation when the active tab index changes.
 *
 * Works with any tab-based column — the animation targets a stable container
 * element (the one that wraps tab content), so it works equally well with
 * single-instance content (e.g. DeckTimelineColumn) and v-if switched content.
 *
 * Usage:
 *   const contentRef = ref<HTMLElement | null>(null)
 *   useTabSlide(tabIndex, contentRef)
 *   // template: <div ref="contentRef">...tab content...</div>
 */
export function useTabSlide(
  tabIndex: Ref<number>,
  contentRef: Ref<HTMLElement | null>,
) {
  let prevIndex = tabIndex.value

  watch(tabIndex, (newIdx) => {
    const el = contentRef.value
    if (!el || newIdx === prevIndex) return

    const cls = newIdx > prevIndex ? 'nd-slide-in-left' : 'nd-slide-in-right'
    prevIndex = newIdx

    // Remove any in-flight animation
    el.classList.remove('nd-slide-in-left', 'nd-slide-in-right')

    // Force reflow to restart animation
    void el.offsetWidth

    el.classList.add(cls)
    el.addEventListener(
      'animationend',
      () => {
        el.classList.remove(cls)
      },
      { once: true },
    )
  })
}
