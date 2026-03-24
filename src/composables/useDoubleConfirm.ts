import { ref } from 'vue'

/**
 * "Click once to arm, click again to execute" confirmation pattern.
 *
 * Used for destructive actions like "clear all" / "reset all".
 */
export function useDoubleConfirm(timeout = 3000) {
  const confirming = ref(false)
  let timer: ReturnType<typeof setTimeout> | null = null

  function trigger(action: () => void) {
    if (confirming.value) {
      if (timer) clearTimeout(timer)
      confirming.value = false
      action()
    } else {
      confirming.value = true
      timer = setTimeout(() => {
        confirming.value = false
      }, timeout)
    }
  }

  return { confirming, trigger }
}
