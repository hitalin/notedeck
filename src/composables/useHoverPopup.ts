import { computed, onUnmounted, shallowRef } from 'vue'

const IS_TOUCH = navigator.maxTouchPoints > 0

// Global singleton state — only one hover popup is active at a time
let activeSlotId: number | null = null
let slotCounter = 0
let showTimer: ReturnType<typeof setTimeout> | null = null
let hideTimer: ReturnType<typeof setTimeout> | null = null
const globalVisible = shallowRef(false)
const globalPosition = shallowRef({ x: 0, y: 0 })

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

export function useHoverPopup(options?: {
  showDelay?: number
  hideDelay?: number
  hideGuardSelector?: string
}) {
  const showDelay = options?.showDelay ?? 250
  const hideDelay = options?.hideDelay ?? 0
  const hideGuardSelector = options?.hideGuardSelector

  const slotId = ++slotCounter

  const isVisible = computed(
    () => globalVisible.value && activeSlotId === slotId,
  )
  const position = computed(() =>
    activeSlotId === slotId ? globalPosition.value : { x: 0, y: 0 },
  )

  function show(pos: { x: number; y: number }) {
    if (IS_TOUCH) return
    // Preempt any pending hide/show from a different slot
    if (activeSlotId !== slotId) {
      clearShowTimer()
      clearHideTimer()
      globalVisible.value = false
    }
    activeSlotId = slotId
    clearHideTimer()
    globalPosition.value = pos
    if (globalVisible.value && activeSlotId === slotId) return
    clearShowTimer()
    showTimer = setTimeout(() => {
      globalVisible.value = true
    }, showDelay)
  }

  function hide() {
    if (activeSlotId !== slotId) return
    clearShowTimer()
    if (!globalVisible.value) return
    if (hideDelay > 0) {
      clearHideTimer()
      hideTimer = setTimeout(() => {
        if (hideGuardSelector) {
          const el = document.querySelector(hideGuardSelector)
          if (el?.matches(':hover')) return
        }
        globalVisible.value = false
        activeSlotId = null
      }, hideDelay)
    } else {
      globalVisible.value = false
      activeSlotId = null
    }
  }

  function cancelHide() {
    if (activeSlotId === slotId) clearHideTimer()
  }

  function forceClose() {
    if (activeSlotId !== slotId) return
    clearShowTimer()
    clearHideTimer()
    globalVisible.value = false
    activeSlotId = null
  }

  onUnmounted(() => {
    if (activeSlotId === slotId) {
      clearShowTimer()
      clearHideTimer()
      globalVisible.value = false
      activeSlotId = null
    }
  })

  return { isVisible, position, show, hide, cancelHide, forceClose }
}
