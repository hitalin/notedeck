import { type InjectionKey, inject, provide, ref } from 'vue'

import { usePerformanceStore } from '@/stores/performance'

const SCROLL_DIR_KEY: InjectionKey<{
  navHidden: ReturnType<typeof ref<boolean>>
  reportScroll: (scrollTop: number) => void
}> = Symbol('scrollDirection')

/** Provide scroll direction tracking from DeckLayout. */
export function provideScrollDirection() {
  const navHidden = ref(false)
  let lastScrollTop = 0
  let accumulatedDelta = 0
  const THRESHOLD = usePerformanceStore().get('scrollHideThreshold')

  function reportScroll(scrollTop: number) {
    const delta = scrollTop - lastScrollTop
    // Reset accumulation on direction change
    if (
      (delta > 0 && accumulatedDelta < 0) ||
      (delta < 0 && accumulatedDelta > 0)
    ) {
      accumulatedDelta = 0
    }
    accumulatedDelta += delta

    if (accumulatedDelta > THRESHOLD) {
      navHidden.value = true
      accumulatedDelta = 0
    } else if (accumulatedDelta < -THRESHOLD || scrollTop <= 0) {
      navHidden.value = false
      accumulatedDelta = 0
    }

    lastScrollTop = scrollTop
  }

  provide(SCROLL_DIR_KEY, { navHidden, reportScroll })
  return { navHidden }
}

/** Inject scroll direction reporter in column components. */
export function useScrollDirection() {
  const ctx = inject(SCROLL_DIR_KEY, null)
  return {
    reportScroll:
      ctx?.reportScroll ??
      (() => {
        /* noop */
      }),
  }
}
