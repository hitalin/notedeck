import { onUnmounted, type Ref, watch } from 'vue'

/**
 * Handle Android back button / gesture by closing overlay UI.
 *
 * When a tracked overlay opens, a history entry is pushed.
 * When Android fires `popstate` (back button), the overlay is closed
 * instead of navigating away / exiting the app.
 */
export function useBackButton(overlayRef: Ref<boolean>, close: () => void) {
  const marker = `nd-overlay-${Math.random().toString(36).slice(2, 8)}`
  let pushed = false

  function onPopState(e: PopStateEvent) {
    if (e.state === marker) return
    if (pushed && overlayRef.value) {
      pushed = false
      close()
    }
  }

  watch(overlayRef, (open) => {
    if (open) {
      history.pushState(marker, '')
      pushed = true
    } else if (pushed) {
      pushed = false
      history.back()
    }
  })

  window.addEventListener('popstate', onPopState)
  onUnmounted(() => {
    window.removeEventListener('popstate', onPopState)
    if (pushed) {
      pushed = false
      history.back()
    }
  })
}
