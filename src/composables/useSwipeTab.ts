import { onUnmounted, type Ref, watch } from 'vue'

const SWIPE_THRESHOLD = 50
const ANGLE_THRESHOLD = 30 // degrees — swipe must be within this angle from horizontal
const WHEEL_THRESHOLD = 50
const WHEEL_COOLDOWN = 300 // ms — prevent rapid-fire tab switches

/**
 * Swipe / horizontal wheel to switch tabs.
 *
 * Callbacks return `true` when the event was consumed (tab switched).
 * When consumed, `stopPropagation()` prevents the parent DeckColumnsArea
 * from also scrolling columns horizontally.
 */
export function useSwipeTab(
  targetRef: Ref<HTMLElement | null>,
  onSwipeLeft: () => boolean | undefined,
  onSwipeRight: () => boolean | undefined,
) {
  let startX = 0
  let startY = 0
  let tracking = false
  let boundEl: HTMLElement | null = null

  // --- Touch ---

  function onTouchStart(e: TouchEvent) {
    const touch = e.touches[0]
    if (!touch) return
    startX = touch.clientX
    startY = touch.clientY
    tracking = true
  }

  function onTouchEnd(e: TouchEvent) {
    if (!tracking) return
    tracking = false

    const touch = e.changedTouches[0]
    if (!touch) return

    const dx = touch.clientX - startX
    const dy = touch.clientY - startY
    const absDx = Math.abs(dx)
    const absDy = Math.abs(dy)

    if (absDx < SWIPE_THRESHOLD) return
    const angle = Math.atan2(absDy, absDx) * (180 / Math.PI)
    if (angle > ANGLE_THRESHOLD) return

    if (dx < 0) {
      onSwipeLeft()
    } else {
      onSwipeRight()
    }
  }

  // --- Mouse wheel (horizontal scroll) ---

  let wheelAccum = 0
  let lastWheelAt = 0

  function onWheel(e: WheelEvent) {
    // Only react to horizontal scroll (deltaX) or shift+wheel (deltaY as horizontal)
    const dx = e.deltaX || (e.shiftKey ? e.deltaY : 0)
    if (dx === 0) return

    const now = Date.now()
    if (now - lastWheelAt > WHEEL_COOLDOWN) {
      wheelAccum = 0
    }

    wheelAccum += dx

    if (Math.abs(wheelAccum) >= WHEEL_THRESHOLD) {
      lastWheelAt = now
      const consumed = wheelAccum > 0 ? onSwipeLeft() : onSwipeRight()
      wheelAccum = 0

      // Stop the event from reaching DeckColumnsArea when tab was switched
      if (consumed) {
        e.stopPropagation()
      }
    }
  }

  // --- Bind / Unbind ---

  function bind(el: HTMLElement) {
    if (boundEl === el) return
    unbind()
    boundEl = el
    el.addEventListener('touchstart', onTouchStart, { passive: true })
    el.addEventListener('touchend', onTouchEnd, { passive: true })
    // Not passive: stopPropagation requires non-passive on some engines
    el.addEventListener('wheel', onWheel)
  }

  function unbind() {
    if (!boundEl) return
    boundEl.removeEventListener('touchstart', onTouchStart)
    boundEl.removeEventListener('touchend', onTouchEnd)
    boundEl.removeEventListener('wheel', onWheel)
    boundEl = null
  }

  watch(
    targetRef,
    (v) => {
      if (v) bind(v)
      else unbind()
    },
    { flush: 'post' },
  )

  onUnmounted(unbind)
}
