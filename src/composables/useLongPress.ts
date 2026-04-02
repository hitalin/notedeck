import { nextTick, onScopeDispose, ref } from 'vue'

const IS_TOUCH = navigator.maxTouchPoints > 0

export function useLongPress(
  callback: (e: PointerEvent) => void,
  options?: { duration?: number },
) {
  const duration = options?.duration ?? 500
  const longPressed = ref(false)

  let timer: ReturnType<typeof setTimeout> | null = null
  let startX = 0
  let startY = 0

  function clear() {
    if (timer) {
      clearTimeout(timer)
      timer = null
    }
  }

  function onPointerdown(e: PointerEvent) {
    if (!IS_TOUCH) return
    clear()
    longPressed.value = false
    startX = e.clientX
    startY = e.clientY
    timer = setTimeout(() => {
      longPressed.value = true
      callback(e)
    }, duration)
  }

  function onPointermove(e: PointerEvent) {
    if (!timer) return
    const dx = e.clientX - startX
    const dy = e.clientY - startY
    if (dx * dx + dy * dy > 100) {
      clear()
    }
  }

  function onPointerup() {
    clear()
    if (longPressed.value) {
      nextTick(() => {
        longPressed.value = false
      })
    }
  }

  function onPointercancel() {
    clear()
    longPressed.value = false
  }

  onScopeDispose(clear)

  return {
    longPressed,
    handlers: { onPointerdown, onPointermove, onPointerup, onPointercancel },
  }
}
