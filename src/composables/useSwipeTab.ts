import { onUnmounted, type Ref, watch } from 'vue'

import { usePerformanceStore } from '@/stores/performance'
import { hapticLight } from '@/utils/haptics'

const DIRECTION_THRESHOLD = 8 // px — minimum move to determine swipe direction
const SOFT_CAP = 80 // px — full-speed tracking up to here
const RUBBER_FACTOR = 0.3 // diminishing returns past SOFT_CAP (iOS-style)
const MAX_SWIPE = 120 // px — hard cap to prevent excessive displacement
const SNAP_BACK_TIMEOUT = 340 // ms — safety fallback for transitionend (300ms CSS + buffer)
const WHEEL_THRESHOLD = 50 // px — accumulated delta to trigger tab switch

/** CSS class names shared with useTabSlide */
export const SWIPE_CLASSES = {
  swiping: 'nd-tab-swiping',
  snapBack: 'nd-tab-snap-back',
} as const

/** CSS custom property for swipe offset */
const SWIPE_VAR = '--nd-swipe'

/** Check if touch target is inside a horizontally scrollable element */
function hasHorizontalScroll(
  target: EventTarget | null,
  boundary: HTMLElement,
): boolean {
  let el = target as HTMLElement | null
  while (el && el !== boundary) {
    if (el.scrollWidth > el.clientWidth) {
      const ox = getComputedStyle(el).overflowX
      if (ox === 'auto' || ox === 'scroll') return true
    }
    el = el.parentElement
  }
  return false
}

/** Apply iOS-style rubber-band: full speed up to SOFT_CAP, then diminishing */
function rubberBand(distance: number): number {
  const abs = Math.abs(distance)
  const sign = Math.sign(distance)
  if (abs <= SOFT_CAP) return distance
  return sign * Math.min(SOFT_CAP + (abs - SOFT_CAP) * RUBBER_FACTOR, MAX_SWIPE)
}

/** Remove all swipe-related CSS state from an element */
function clearSwipeState(el: HTMLElement) {
  el.classList.remove(SWIPE_CLASSES.swiping, SWIPE_CLASSES.snapBack)
  el.style.removeProperty(SWIPE_VAR)
}

/**
 * Swipe / horizontal wheel to switch tabs.
 *
 * Touch gestures provide real-time visual feedback via `--nd-swipe` CSS variable,
 * making the content follow the finger during swipe.
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
  const perfStore = usePerformanceStore()
  const SWIPE_THRESHOLD = perfStore.get('swipeThreshold')
  const FLING_VELOCITY = perfStore.get('flingVelocity')
  const WHEEL_COOLDOWN = perfStore.get('wheelCooldown')

  let startX = 0
  let startY = 0
  let startTime = 0
  let tracking = false
  let direction: 'horizontal' | 'vertical' | null = null
  let boundEl: HTMLElement | null = null

  // --- Touch ---

  function onTouchStart(e: TouchEvent) {
    const touch = e.touches[0]
    if (!touch) return
    // Skip swipe if touch is inside a horizontally scrollable child (e.g. CodeMirror)
    if (boundEl && hasHorizontalScroll(e.target, boundEl)) return
    startX = touch.clientX
    startY = touch.clientY
    startTime = Date.now()
    tracking = true
    direction = null

    if (boundEl) {
      // Clear any lingering snap-back state
      boundEl.classList.remove(SWIPE_CLASSES.snapBack)
      boundEl.style.removeProperty(SWIPE_VAR)
    }
  }

  function onTouchMove(e: TouchEvent) {
    if (!tracking) return
    // Cancel swipe on multi-touch (e.g. pinch-to-zoom)
    if (e.touches.length > 1) {
      tracking = false
      if (boundEl && direction === 'horizontal') clearSwipeState(boundEl)
      direction = null
      return
    }
    const touch = e.touches[0]
    if (!touch) return

    const dx = touch.clientX - startX
    const dy = touch.clientY - startY
    const absDx = Math.abs(dx)
    const absDy = Math.abs(dy)

    // Lock to dominant axis on first significant move
    if (
      direction === null &&
      (absDx > DIRECTION_THRESHOLD || absDy > DIRECTION_THRESHOLD)
    ) {
      direction = absDx >= absDy ? 'horizontal' : 'vertical'
      if (direction === 'horizontal') {
        boundEl?.classList.add(SWIPE_CLASSES.swiping)
      }
    }

    if (direction !== 'horizontal') return

    // Axis locked — block scroll, track pure horizontal displacement
    e.preventDefault()
    boundEl?.style.setProperty(SWIPE_VAR, `${rubberBand(dx)}px`)
  }

  function snapBack(el: HTMLElement) {
    el.classList.add(SWIPE_CLASSES.snapBack)
    el.style.setProperty(SWIPE_VAR, '0px')
    let cleaned = false
    const cleanup = () => {
      if (cleaned) return
      cleaned = true
      clearSwipeState(el)
    }
    el.addEventListener('transitionend', cleanup, { once: true })
    setTimeout(cleanup, SNAP_BACK_TIMEOUT)
  }

  function onTouchEnd(e: TouchEvent) {
    if (!tracking) return
    tracking = false

    const el = boundEl
    if (!el || direction !== 'horizontal') {
      direction = null
      return
    }
    direction = null

    const touch = e.changedTouches[0]
    if (!touch) return

    const dx = touch.clientX - startX
    const absDx = Math.abs(dx)
    const elapsed = Date.now() - startTime
    const velocity = elapsed > 0 ? absDx / elapsed : 0

    if (absDx < SWIPE_THRESHOLD && velocity < FLING_VELOCITY) {
      snapBack(el)
      return
    }

    const consumed = dx < 0 ? onSwipeLeft() : onSwipeRight()
    if (consumed) {
      hapticLight()
      // Tab switched — clear swipe state, useTabSlide handles enter animation
      clearSwipeState(el)
    } else {
      // No tab in that direction — snap back
      snapBack(el)
    }
  }

  function onTouchCancel() {
    if (!tracking) return
    tracking = false
    if (boundEl && direction === 'horizontal') clearSwipeState(boundEl)
    direction = null
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
        hapticLight()
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
    el.addEventListener('touchmove', onTouchMove, { passive: false })
    el.addEventListener('touchend', onTouchEnd, { passive: true })
    el.addEventListener('touchcancel', onTouchCancel, { passive: true })
    el.addEventListener('wheel', onWheel, { passive: true })
  }

  function unbind() {
    if (!boundEl) return
    boundEl.removeEventListener('touchstart', onTouchStart)
    boundEl.removeEventListener('touchmove', onTouchMove)
    boundEl.removeEventListener('touchend', onTouchEnd)
    boundEl.removeEventListener('touchcancel', onTouchCancel)
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
