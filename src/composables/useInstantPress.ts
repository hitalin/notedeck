import { onScopeDispose, ref } from 'vue'

/**
 * Provides instant visual press feedback (0ms delay on pointerdown).
 *
 * Unlike CSS `:active` which waits for the browser's activation delay,
 * this composable applies the pressed state synchronously on `pointerdown`,
 * giving osu!-like immediate tactile response.
 *
 * Usage:
 *   const { pressed, handlers } = useInstantPress()
 *   <button :class="{ [$style.pressed]: pressed }" v-on="handlers">
 *
 * CSS side:
 *   .pressed { transform: scale(var(--nd-active-scale)); }
 *   (no transition on press; spring transition on release via base rule)
 */
export function useInstantPress() {
  const pressed = ref(false)
  let activePointerId: number | null = null

  function onPointerdown(e: PointerEvent) {
    pressed.value = true
    activePointerId = e.pointerId
  }

  function release() {
    pressed.value = false
    activePointerId = null
  }

  function onPointerup(e: PointerEvent) {
    if (e.pointerId === activePointerId) release()
  }

  function onPointerleave(e: PointerEvent) {
    if (e.pointerId === activePointerId) release()
  }

  function onPointercancel(e: PointerEvent) {
    if (e.pointerId === activePointerId) release()
  }

  onScopeDispose(release)

  const handlers = {
    pointerdown: onPointerdown,
    pointerup: onPointerup,
    pointerleave: onPointerleave,
    pointercancel: onPointercancel,
  }

  return { pressed, handlers }
}
