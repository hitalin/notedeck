import type { Ref, WatchSource } from 'vue'
import { nextTick, onMounted, onScopeDispose, ref, watch } from 'vue'
import { frameEngine } from '@/engine/frameEngine'

/**
 * Manages a sliding tab indicator that tracks the active tab element.
 *
 * Gaming CSS v2: Uses Frame Engine's read/write phase separation
 * to batch DOM reads (offsetLeft/offsetWidth) and writes (style update)
 * into proper phases, preventing layout thrashing.
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
  const style = ref({ translate: '0 0', scale: '0 1', opacity: '0' })
  let pending = false

  function update() {
    if (pending) return
    pending = true

    // Read phase: measure DOM
    frameEngine.schedule('read', () => {
      if (!containerRef.value) {
        pending = false
        style.value = { translate: '0 0', scale: '0 1', opacity: '0' }
        return
      }
      const activeTab = containerRef.value.querySelector(
        activeSelector,
      ) as HTMLElement | null
      if (!activeTab) {
        pending = false
        style.value = { translate: '0 0', scale: '0 1', opacity: '0' }
        return
      }

      const left = activeTab.offsetLeft
      const width = activeTab.offsetWidth

      // Write phase: update style (scheduled from within read)
      frameEngine.schedule('write', () => {
        pending = false
        style.value = {
          translate: `${left}px 0`,
          scale: `${width} 1`,
          opacity: '1',
        }
      })
    })
  }

  watch(trigger, () => nextTick(update))
  onMounted(() => nextTick(update))

  onScopeDispose(() => {
    pending = false
  })

  return { indicatorStyle: style, updateIndicator: update }
}
