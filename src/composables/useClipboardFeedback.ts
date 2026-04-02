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

  async function copyToClipboard(text: string) {
    try {
      await navigator.clipboard.writeText(text)
    } catch {
      // Fallback for mobile WebView where clipboard API may be restricted
      const ta = document.createElement('textarea')
      ta.value = text
      ta.style.cssText = 'position:fixed;opacity:0'
      document.body.appendChild(ta)
      ta.select()
      document.execCommand('copy')
      document.body.removeChild(ta)
    }
    showCopied()
  }

  async function readFromClipboard(): Promise<string | null> {
    try {
      return await navigator.clipboard.readText()
    } catch {
      return null
    }
  }

  return {
    copied,
    imported,
    importFeedback: imported,
    importError,
    showCopied,
    showImported,
    showImportError,
    copyToClipboard,
    readFromClipboard,
  }
}
