import { inject, type Ref, watch } from 'vue'

/**
 * Register a scroller element for DeckColumn's unified pull-to-refresh.
 * Call this in any column component that has a scrollable area
 * and passes `:pull-refresh` to DeckColumn.
 */
export function useColumnPullScroller(scrollerRef: Ref<HTMLElement | null>) {
  const target = inject<Ref<HTMLElement | null> | undefined>(
    'deckPullScrollerTarget',
    undefined,
  )
  if (target) {
    watch(
      scrollerRef,
      (el) => {
        target.value = el
      },
      { immediate: true, flush: 'post' },
    )
  }
}
