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
  /**
   * MisStore でストア配布されている 4 種類 (plugin / widget / theme / skill)
   * のインストール / 更新 / 削除 / ロールバックを確認するときに、ストアカード
   * 風の構造化プレビューを表示する。指定された場合 AppConfirm が `message` の
   * 下、`code` の上にレンダリングする。AI tool calling 経由の各 write
   * capability で「ストアタブと統一感のある確認 UI」を出すために使う。
   *
   * `permissions` は plugin / widget の Misskey 互換 permission 配列。
   * theme / skill では未使用 (空配列か省略)。
   */
  installPreview?: {
    kind: 'plugin' | 'widget' | 'theme' | 'skill'
    name: string
    version?: string
    author?: string
    description?: string
    permissions?: string[]
  }
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
