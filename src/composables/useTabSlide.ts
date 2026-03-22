import { type Ref, watch } from 'vue'

/**
 * Apply a directional slide-in animation when the active tab index changes.
 *
 * Uses `{ flush: 'post' }` so the animation class is added **after** the DOM
 * has been updated with new content (e.g. snapshot notes from switchWithSnapshot).
 */
export function useTabSlide(
  tabIndex: Ref<number>,
  contentRef: Ref<HTMLElement | null>,
) {
  let prev: number | undefined

  watch(
    tabIndex,
    (cur) => {
      const el = contentRef.value
      if (!el || prev === undefined || cur === prev) {
        prev = cur
        return
      }

      const cls = cur > prev ? 'nd-slide-in-left' : 'nd-slide-in-right'
      prev = cur

      el.classList.remove('nd-slide-in-left', 'nd-slide-in-right')
      void el.offsetWidth // force reflow to restart animation
      el.classList.add(cls)
      el.addEventListener('animationend', () => el.classList.remove(cls), {
        once: true,
      })
    },
    { flush: 'post' },
  )
}
