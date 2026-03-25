import { onUnmounted, type Ref, watch } from 'vue'

const SWIPE_THRESHOLD = 50
const FLING_VELOCITY = 0.4 // px/ms — fast flick switches tab even if distance < threshold
const ANGLE_THRESHOLD = 30 // degrees — swipe must be within this angle from horizontal
const SOFT_CAP = 80 // px — full-speed tracking up to here
const RUBBER_FACTOR = 0.3 // diminishing returns past SOFT_CAP (iOS-style)
const WHEEL_THRESHOLD = 50
const WHEEL_COOLDOWN = 300 // ms — prevent rapid-fire tab switches

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
  return sign * (SOFT_CAP + (abs - SOFT_CAP) * RUBBER_FACTOR)
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

    const el = boundEl
    if (el) {
      // Clear any lingering snap-back state
      el.classList.remove('nd-tab-snap-back')
      el.style.removeProperty('--nd-swipe')
    }
  }

  function onTouchMove(e: TouchEvent) {
    if (!tracking) return
    // Cancel swipe on multi-touch (e.g. pinch-to-zoom)
    if (e.touches.length > 1) {
      tracking = false
      const el = boundEl
      if (el && direction === 'horizontal') {
        el.classList.remove('nd-tab-swiping')
        el.style.removeProperty('--nd-swipe')
      }
      direction = null
      return
    }
    const touch = e.touches[0]
    if (!touch) return

    const dx = touch.clientX - startX
    const dy = touch.clientY - startY
    const absDx = Math.abs(dx)
    const absDy = Math.abs(dy)

    // Determine direction on first significant move
    if (direction === null && (absDx > 8 || absDy > 8)) {
      const angle = Math.atan2(absDy, absDx) * (180 / Math.PI)
      direction = angle <= ANGLE_THRESHOLD ? 'horizontal' : 'vertical'
      if (direction === 'horizontal') {
        boundEl?.classList.add('nd-tab-swiping')
      }
    }

    if (direction !== 'horizontal') return

    e.preventDefault()

    boundEl?.style.setProperty('--nd-swipe', `${rubberBand(dx)}px`)
  }

  function snapBack(el: HTMLElement) {
    el.classList.add('nd-tab-snap-back')
    el.style.setProperty('--nd-swipe', '0px')
    let cleaned = false
    const cleanup = () => {
      if (cleaned) return
      cleaned = true
      el.classList.remove('nd-tab-swiping', 'nd-tab-snap-back')
      el.style.removeProperty('--nd-swipe')
    }
    el.addEventListener('transitionend', cleanup, { once: true })
    setTimeout(cleanup, 220)
  }

  function onTouchEnd(e: TouchEvent) {
    if (!tracking) return
    tracking = false

    const el = boundEl
    if (!el) return

    if (direction === 'horizontal') {
      const touch = e.changedTouches[0]
      if (touch) {
        const dx = touch.clientX - startX
        const absDx = Math.abs(dx)

        const elapsed = Date.now() - startTime
        const velocity = elapsed > 0 ? absDx / elapsed : 0
        if (absDx >= SWIPE_THRESHOLD || velocity >= FLING_VELOCITY) {
          const consumed = dx < 0 ? onSwipeLeft() : onSwipeRight()
          if (consumed) {
            // Tab switched — clear swipe state, useTabSlide handles enter animation
            el.classList.remove('nd-tab-swiping')
            el.style.removeProperty('--nd-swipe')
          } else {
            // No tab in that direction — snap back
            snapBack(el)
          }
        } else {
          snapBack(el)
        }
      }
    }

    direction = null
  }

  function onTouchCancel() {
    if (!tracking) return
    tracking = false
    const el = boundEl
    if (el && direction === 'horizontal') {
      el.classList.remove('nd-tab-swiping')
      el.style.removeProperty('--nd-swipe')
    }
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
    // Not passive: stopPropagation requires non-passive on some engines
    el.addEventListener('wheel', onWheel)
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
