import { ref } from 'vue'

export type ConfirmType =
  | 'normal'
  | 'danger'
  | 'warning'
  | 'info'
  | 'success'
  | 'error'
  | 'question'
  | 'waiting'
export type ConfirmIcon =
  | 'info'
  | 'question'
  | 'success'
  | 'warn'
  | 'error'
  | 'waiting'
  | 'none'

export interface ConfirmOptions {
  title: string
  message: string
  okLabel?: string
  cancelLabel?: string
  type?: ConfirmType
  icon?: ConfirmIcon
  hideCancel?: boolean
  /**
   * `message` に続けて表示するコードブロック (JSON / AiScript / markdown 等)。
   * 指定された場合 AppConfirm が `<pre>` でシンタックスハイライト表示する。
   * 「capability の引数 JSON」「skill / widget / plugin の編集前後 diff」など
   * 構造化テキストを見せるのに使う。
   */
  code?: string
  /** code 用の言語キー (default: 'json')。`highlightCode` の lang と一致。 */
  codeLanguage?: string
}

const visible = ref(false)
const options = ref<ConfirmOptions>({ title: '', message: '' })
let resolvePromise: ((value: boolean) => void) | null = null

export function useConfirm() {
  function confirm(opts: ConfirmOptions): Promise<boolean> {
    if (resolvePromise) {
      resolvePromise(false)
    }
    options.value = opts
    visible.value = true
    return new Promise<boolean>((resolve) => {
      resolvePromise = resolve
    })
  }

  function resolve(result: boolean) {
    visible.value = false
    resolvePromise?.(result)
    resolvePromise = null
  }

  return { visible, options, confirm, resolve }
}
