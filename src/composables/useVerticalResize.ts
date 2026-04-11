import type { Ref } from 'vue'
import { onScopeDispose, ref } from 'vue'

export interface UseVerticalResizeOptions {
  /** リサイズ対象のコンテナ要素 */
  containerRef: Ref<HTMLElement | null | undefined>
  /** 'ratio': 上パネルの flex 比率 (0–1)、'bottom-px': 下パネルの絶対高さ (px) */
  mode: 'ratio' | 'bottom-px'
  /** 初期値（ratio: 0–1, bottom-px: px） */
  initial: number
  /** 最小値 */
  min: number
  /** 最大値（ratio: 0–1, bottom-px: コンテナ依存の場合は省略可） */
  max?: number
  /** bottom-px モードで、コンテナ高さに対する上限マージン (px)。デフォルト 80 */
  topMargin?: number
}

export function useVerticalResize(options: UseVerticalResizeOptions) {
  const { containerRef, mode, min } = options
  const value = ref(options.initial)
  let resizing = false

  function start(e: PointerEvent) {
    e.preventDefault()
    resizing = true
    document.body.style.userSelect = 'none'
    document.body.style.cursor = 'row-resize'
    document.addEventListener('pointermove', move)
    document.addEventListener('pointerup', stop)
    document.addEventListener('pointercancel', stop)
  }

  function move(e: PointerEvent) {
    if (!resizing || !containerRef.value) return
    const rect = containerRef.value.getBoundingClientRect()

    if (mode === 'ratio') {
      const ratio = (e.clientY - rect.top) / rect.height
      const max = options.max ?? 0.85
      value.value = Math.max(min, Math.min(ratio, max))
    } else {
      const px = rect.bottom - e.clientY
      const topMargin = options.topMargin ?? 80
      const max = options.max ?? rect.height - topMargin
      value.value = Math.max(min, Math.min(px, max))
    }
  }

  function stop() {
    resizing = false
    document.body.style.userSelect = ''
    document.body.style.cursor = ''
    document.removeEventListener('pointermove', move)
    document.removeEventListener('pointerup', stop)
    document.removeEventListener('pointercancel', stop)
  }

  onScopeDispose(() => {
    if (resizing) stop()
  })

  return { value, start, stop }
}
