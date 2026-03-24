import { ref } from 'vue'

/**
 * Clipboard copy/import with timed feedback state.
 *
 * Returns reactive flags (`copied`, `imported`, `importError`) that
 * auto-reset after `duration` ms, plus `showCopied()` / `showImported()` /
 * `showImportError()` helpers.
 */
export function useClipboardFeedback(duration = 2000) {
  const copied = ref(false)
  const imported = ref(false)
  const importError = ref(false)

  function showCopied() {
    copied.value = true
    setTimeout(() => {
      copied.value = false
    }, duration)
  }

  function showImported() {
    imported.value = true
    setTimeout(() => {
      imported.value = false
    }, duration)
  }

  function showImportError() {
    importError.value = true
    setTimeout(() => {
      importError.value = false
    }, duration)
  }

  return {
    copied,
    imported,
    importError,
    showCopied,
    showImported,
    showImportError,
  }
}
