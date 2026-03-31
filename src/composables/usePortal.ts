import { onScopeDispose, type Ref, watch } from 'vue'

/**
 * Vapor-compatible replacement for `<Teleport to="body">`.
 * Moves the referenced element to `document.body` when it appears in the DOM.
 */
export function usePortal(target: Ref<HTMLElement | null | undefined>) {
  watch(target, (el) => {
    if (el && el.parentNode !== document.body) {
      document.body.appendChild(el)
    }
  })

  onScopeDispose(() => {
    target.value?.remove()
  })
}
