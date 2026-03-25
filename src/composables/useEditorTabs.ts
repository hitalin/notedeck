import { computed, type Ref, ref } from 'vue'
import { useSwipeTab } from '@/composables/useSwipeTab'
import { useTabSlide } from '@/composables/useTabSlide'

/**
 * Unified tab management for editor windows (visual/code pattern).
 *
 * Wraps `useTabSlide` + `useSwipeTab` so each editor doesn't repeat
 * the same boilerplate.
 */
export function useEditorTabs<T extends string>(
  tabs: readonly T[],
  defaultTab: T,
) {
  const tab = ref(defaultTab) as Ref<T>
  const containerRef = ref<HTMLElement | null>(null)
  const tabIndex = computed(() => tabs.indexOf(tab.value))

  useTabSlide(tabIndex, containerRef)

  useSwipeTab(
    containerRef,
    () => {
      const next = tabs[tabs.indexOf(tab.value) + 1]
      if (next) {
        tab.value = next
        return true
      }
    },
    () => {
      const prev = tabs[tabs.indexOf(tab.value) - 1]
      if (prev) {
        tab.value = prev
        return true
      }
    },
  )

  return { tab, containerRef }
}
