import { nextTick, onScopeDispose, type Ref, watch } from 'vue'

interface NativeDialogOptions {
  /** Called when user presses Escape (cancel event) */
  onCancel?: () => void
  /** CSS selector for initial focus target inside dialog */
  initialFocus?: string
  /** Leave animation duration in ms — dialog.close() is delayed until animation completes */
  leaveDuration?: number
}

/**
 * Vapor-compatible composable wrapping `<dialog>` showModal()/close().
 *
 * Replaces usePortal + useFocusTrap:
 * - showModal() places the dialog in the top layer (no z-index / overflow issues)
 * - Native focus trap keeps Tab cycling inside the dialog
 * - cancel event (Escape key) fires onCancel callback
 * - ::backdrop pseudo-element replaces _dialogBackdrop div
 */
export function useNativeDialog(
  dialogRef: Ref<HTMLDialogElement | null>,
  show: Ref<boolean>,
  options: NativeDialogOptions = {},
) {
  const { leaveDuration = 200 } = options
  let closeTimer: ReturnType<typeof setTimeout> | null = null

  function onCancel(e: Event) {
    e.preventDefault()
    options.onCancel?.()
  }

  // Backdrop click: dialog element itself is the backdrop target
  function onClick(e: MouseEvent) {
    if (e.target === dialogRef.value) {
      options.onCancel?.()
    }
  }

  watch(show, (val) => {
    if (closeTimer != null) {
      clearTimeout(closeTimer)
      closeTimer = null
    }

    const el = dialogRef.value
    if (!el) return

    if (val) {
      if (!el.open) el.showModal()

      // Initial focus
      nextTick(() => {
        if (options.initialFocus) {
          const target = el.querySelector<HTMLElement>(options.initialFocus)
          if (target) {
            target.focus()
            return
          }
        }
      })
    } else {
      // Delay close() to allow leave animation
      closeTimer = setTimeout(() => {
        closeTimer = null
        if (el.open) el.close()
      }, leaveDuration)
    }
  })

  watch(dialogRef, (el, oldEl) => {
    oldEl?.removeEventListener('cancel', onCancel)
    oldEl?.removeEventListener('click', onClick)
    if (el) {
      el.addEventListener('cancel', onCancel)
      el.addEventListener('click', onClick)
      // v-if mount: show watch may have fired before ref was assigned
      if (show.value && !el.open) {
        el.showModal()
        const selector = options.initialFocus
        if (selector) {
          nextTick(() => {
            el.querySelector<HTMLElement>(selector)?.focus()
          })
        }
      }
    }
  })

  onScopeDispose(() => {
    if (closeTimer != null) clearTimeout(closeTimer)
    dialogRef.value?.removeEventListener('cancel', onCancel)
    dialogRef.value?.removeEventListener('click', onClick)
    if (dialogRef.value?.open) dialogRef.value.close()
  })
}
