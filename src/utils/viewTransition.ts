type DocumentWithViewTransition = Document & {
  startViewTransition?: (callback: () => void | Promise<void>) => unknown
}

/**
 * View Transitions API による画面全体のクロスフェード。
 * 未対応環境・reduced-motion では即時実行にフォールバックする
 * (テーマ切替・プロファイル切替のフラッシュ抑制用のエンハンス枠)。
 */
export function withViewTransition(fn: () => void | Promise<void>): void {
  const doc = document as DocumentWithViewTransition
  const reduceMotion = window.matchMedia(
    '(prefers-reduced-motion: reduce)',
  ).matches
  if (reduceMotion || typeof doc.startViewTransition !== 'function') {
    void fn()
    return
  }
  doc.startViewTransition(fn)
}
