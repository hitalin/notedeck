import { onUnmounted, ref } from 'vue'

/**
 * Track visual viewport changes (e.g. soft keyboard open/close on mobile).
 *
 * Sets `--nd-vv-height` CSS variable on `<html>` so components can use it
 * instead of `100vh` (which doesn't account for the keyboard).
 *
 * Returns reactive `keyboardOpen` flag.
 */
export function useVisualViewport() {
  const keyboardOpen = ref(false)

  const vv = window.visualViewport
  if (!vv) return { keyboardOpen }

  function onViewportChange() {
    if (!vv) return
    const heightDiff = window.innerHeight - vv.height
    // Keyboard is considered open when viewport shrinks by >150px
    keyboardOpen.value = heightDiff > 150
    document.documentElement.style.setProperty(
      '--nd-vv-height',
      `${vv.height}px`,
    )
  }

  // Set initial value
  onViewportChange()

  vv.addEventListener('resize', onViewportChange)
  vv.addEventListener('scroll', onViewportChange)

  onUnmounted(() => {
    vv.removeEventListener('resize', onViewportChange)
    vv.removeEventListener('scroll', onViewportChange)
    document.documentElement.style.removeProperty('--nd-vv-height')
  })

  return { keyboardOpen }
}
