import { onUnmounted, type Ref, watch } from 'vue'

// --- モジュールレベル シングルトン ---

interface OverlayEntry {
  id: string
  close: () => void
}

const MARKER = 'nd-overlay'
const stack: OverlayEntry[] = []
let historyActive = false
let ignoringPop = false

function handlePopState() {
  if (ignoringPop) {
    ignoringPop = false
    return
  }
  historyActive = false
  const top = stack.pop()
  if (top) top.close()
  // 残りがあれば再 push
  if (stack.length > 0) {
    history.pushState(MARKER, '')
    historyActive = true
  }
}

if (typeof window !== 'undefined') {
  window.addEventListener('popstate', handlePopState)
}

// --- Public API ---

/**
 * Overlay を登録し、Android back button で閉じられるようにする。
 * 戻り値は解除関数（冪等）。
 */
export function pushOverlay(close: () => void): () => void {
  const id = `nd-${Math.random().toString(36).slice(2, 8)}`
  stack.push({ id, close })
  if (!historyActive) {
    history.pushState(MARKER, '')
    historyActive = true
  }
  let removed = false
  return () => {
    if (removed) return
    removed = true
    const idx = stack.findIndex((e) => e.id === id)
    if (idx === -1) return // back 操作で既に pop 済み
    stack.splice(idx, 1)
    if (stack.length === 0 && historyActive) {
      ignoringPop = true
      historyActive = false
      history.back()
    }
  }
}

/**
 * Composable: ref を監視して overlay を自動登録/解除する。
 * Android back button / gesture でオーバーレイ UI を閉じる。
 */
export function useBackButton(overlayRef: Ref<boolean>, close: () => void) {
  let unregister: (() => void) | null = null

  watch(overlayRef, (open) => {
    if (open) {
      unregister = pushOverlay(close)
    } else {
      unregister?.()
      unregister = null
    }
  })

  onUnmounted(() => {
    unregister?.()
    unregister = null
  })
}
