import { onUnmounted, ref } from 'vue'

export function useHoverPopup(options?: {
  showDelay?: number
  hideDelay?: number
  hideGuardSelector?: string
}) {
  const showDelay = options?.showDelay ?? 400
  const hideDelay = options?.hideDelay ?? 0
  const hideGuardSelector = options?.hideGuardSelector

  const isVisible = ref(false)
  const position = ref({ x: 0, y: 0 })

  let showTimer: ReturnType<typeof setTimeout> | null = null
  let hideTimer: ReturnType<typeof setTimeout> | null = null

  function clearShowTimer() {
    if (showTimer) {
      clearTimeout(showTimer)
      showTimer = null
    }
  }

  function clearHideTimer() {
    if (hideTimer) {
      clearTimeout(hideTimer)
      hideTimer = null
    }
  }

  function show(pos: { x: number; y: number }) {
    // タッチデバイスではホバーポップアップを無効化
    if (navigator.maxTouchPoints > 0) return
    clearHideTimer()
    position.value = pos
    if (isVisible.value) return
    clearShowTimer()
    showTimer = setTimeout(() => {
      isVisible.value = true
    }, showDelay)
  }

  function hide() {
    clearShowTimer()
    if (!isVisible.value) return
    if (hideDelay > 0) {
      clearHideTimer()
      hideTimer = setTimeout(() => {
        if (hideGuardSelector) {
          const el = document.querySelector(hideGuardSelector)
          if (el?.matches(':hover')) return
        }
        isVisible.value = false
      }, hideDelay)
    } else {
      isVisible.value = false
    }
  }

  function cancelHide() {
    clearHideTimer()
  }

  function forceClose() {
    clearShowTimer()
    clearHideTimer()
    isVisible.value = false
  }

  onUnmounted(() => {
    clearShowTimer()
    clearHideTimer()
  })

  return { isVisible, position, show, hide, cancelHide, forceClose }
}
