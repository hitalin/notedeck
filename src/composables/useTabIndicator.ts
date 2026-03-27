import type { Ref, WatchSource } from 'vue'
import { nextTick, onMounted, onScopeDispose, ref, watch } from 'vue'

/**
 * Manages a sliding tab indicator that tracks the active tab element.
 *
 * Uses requestAnimationFrame to batch DOM reads (offsetLeft/offsetWidth)
 * and writes (style update) into a single frame, preventing layout thrashing
 * when multiple triggers fire in quick succession.
 *
 * @param containerRef - Ref to the container element holding the tabs
 * @param activeSelector - CSS selector for the currently active tab
 * @param trigger - Reactive source that triggers indicator update on change
 */
export function useTabIndicator(
  containerRef: Ref<HTMLElement | null>,
  activeSelector: string,
  trigger: WatchSource,
) {
  const style = ref({ left: '0px', width: '0px', opacity: '0' })
  let rafId: number | null = null

  function update() {
    if (rafId !== null) return
    rafId = requestAnimationFrame(() => {
      rafId = null
      if (!containerRef.value) return
      const activeTab = containerRef.value.querySelector(
        activeSelector,
      ) as HTMLElement | null
      if (!activeTab) {
        style.value = { left: '0px', width: '0px', opacity: '0' }
        return
      }
      style.value = {
        left: `${activeTab.offsetLeft}px`,
        width: `${activeTab.offsetWidth}px`,
        opacity: '1',
      }
    })
  }

  watch(trigger, () => nextTick(update))
  onMounted(() => nextTick(update))

  onScopeDispose(() => {
    if (rafId !== null) {
      cancelAnimationFrame(rafId)
      rafId = null
    }
  })

  return { indicatorStyle: style, updateIndicator: update }
}
