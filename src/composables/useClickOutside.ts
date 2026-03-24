import { onMounted, onUnmounted, type Ref } from 'vue'

/**
 * Run a callback when a click occurs outside the target element.
 */
export function useClickOutside(
  targetRef: Ref<HTMLElement | null>,
  callback: () => void,
) {
  function handler(e: MouseEvent) {
    if (targetRef.value && !targetRef.value.contains(e.target as Node)) {
      callback()
    }
  }

  onMounted(() => document.addEventListener('click', handler))
  onUnmounted(() => document.removeEventListener('click', handler))
}
