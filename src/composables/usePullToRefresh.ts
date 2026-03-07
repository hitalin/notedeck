import { onUnmounted, type Ref, ref, watch } from 'vue'
import type { DynamicScroller } from 'vue-virtual-scroller'

const PULL_THRESHOLD = 64
const MAX_PULL = 128

export function usePullToRefresh(
  scrollerRef: Ref<InstanceType<typeof DynamicScroller> | null>,
  onRefresh: () => Promise<void>,
) {
  const pullDistance = ref(0)
  const isRefreshing = ref(false)

  let startY = 0
  let pulling = false
  let boundEl: HTMLElement | null = null

  function getEl(): HTMLElement | null {
    return (scrollerRef.value?.$el as HTMLElement) ?? null
  }

  function onTouchStart(e: TouchEvent) {
    if (isRefreshing.value) return
    const el = getEl()
    if (!el || el.scrollTop > 0) return
    startY = e.touches[0]?.clientY ?? 0
    pulling = true
  }

  function onTouchMove(e: TouchEvent) {
    if (!pulling || isRefreshing.value) return
    const el = getEl()
    if (!el || el.scrollTop > 0) {
      pulling = false
      pullDistance.value = 0
      return
    }
    const dy = (e.touches[0]?.clientY ?? 0) - startY
    if (dy <= 0) {
      pullDistance.value = 0
      return
    }
    pullDistance.value = Math.min(dy * 0.5, MAX_PULL)
    if (pullDistance.value > 0) {
      e.preventDefault()
    }
  }

  async function onTouchEnd() {
    if (!pulling) return
    pulling = false
    if (pullDistance.value >= PULL_THRESHOLD && !isRefreshing.value) {
      isRefreshing.value = true
      pullDistance.value = PULL_THRESHOLD
      try {
        await onRefresh()
      } finally {
        isRefreshing.value = false
        pullDistance.value = 0
      }
    } else {
      pullDistance.value = 0
    }
  }

  function bind(el: HTMLElement) {
    if (boundEl === el) return
    unbind()
    boundEl = el
    el.addEventListener('touchstart', onTouchStart, { passive: true })
    el.addEventListener('touchmove', onTouchMove, { passive: false })
    el.addEventListener('touchend', onTouchEnd, { passive: true })
  }

  function unbind() {
    if (!boundEl) return
    boundEl.removeEventListener('touchstart', onTouchStart)
    boundEl.removeEventListener('touchmove', onTouchMove)
    boundEl.removeEventListener('touchend', onTouchEnd)
    boundEl = null
  }

  watch(
    scrollerRef,
    (v) => {
      const el = (v?.$el as HTMLElement) ?? null
      if (el) bind(el)
      else unbind()
    },
    { flush: 'post' },
  )

  onUnmounted(unbind)

  return { pullDistance, isRefreshing }
}
