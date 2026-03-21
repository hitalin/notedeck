import type { Ref, WatchSource } from 'vue'
import { nextTick, onMounted, ref, watch } from 'vue'

/**
 * Manages a sliding tab indicator that tracks the active tab element.
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

  function update() {
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
  }

  watch(trigger, () => nextTick(update))
  onMounted(() => nextTick(update))

  return { indicatorStyle: style, updateIndicator: update }
}
