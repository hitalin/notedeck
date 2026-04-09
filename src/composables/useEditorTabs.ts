import { computed, isRef, type Ref, ref } from 'vue'
import { useSwipeTab } from '@/composables/useSwipeTab'
import { useTabSlide } from '@/composables/useTabSlide'

/**
 * Unified tab management for editor windows (visual/code pattern).
 *
 * Wraps `useTabSlide` + `useSwipeTab` so each editor doesn't repeat
 * the same boilerplate.
 *
 * Pass a plain array for a fixed tab set, or a `Ref<readonly T[]>` when
 * the visible tabs depend on runtime state (e.g. privacy flags).
 */
export function useEditorTabs<T extends string>(
  tabs: readonly T[] | Ref<readonly T[]>,
  defaultTab: T,
) {
  const tabsRef = computed<readonly T[]>(() =>
    isRef(tabs) ? tabs.value : tabs,
  )
  const tab = ref(defaultTab) as Ref<T>
  const containerRef = ref<HTMLElement | null>(null)
  const tabIndex = computed(() => tabsRef.value.indexOf(tab.value))

  useTabSlide(tabIndex, containerRef)

  useSwipeTab(
    containerRef,
    () => {
      const list = tabsRef.value
      const next = list[list.indexOf(tab.value) + 1]
      if (next) {
        tab.value = next
        return true
      }
    },
    () => {
      const list = tabsRef.value
      const prev = list[list.indexOf(tab.value) - 1]
      if (prev) {
        tab.value = prev
        return true
      }
    },
  )

  return { tab, containerRef }
}
