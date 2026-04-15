import {
  type InjectionKey,
  inject,
  onScopeDispose,
  provide,
  type Ref,
  ref,
  watchEffect,
} from 'vue'

export interface WindowExternalFile {
  name: string
  subdir?: string
  disabled?: boolean
}

export const WINDOW_EXTERNAL_FILE_KEY: InjectionKey<
  Ref<WindowExternalFile | null>
> = Symbol('windowExternalFile')

/**
 * DeckWindow 側で provide する。戻り値の ref を読んでヘッダーのボタン表示を判定する。
 */
export function provideWindowExternalFile() {
  const target = ref<WindowExternalFile | null>(null)
  provide(WINDOW_EXTERNAL_FILE_KEY, target)
  return target
}

/**
 * 編集ウィンドウの中身 (Content コンポーネント) から、ヘッダーに置く
 * 「外部エディタで開く」ボタンの対象ファイルを登録する。
 *
 * `source` はリアクティブ (ref/computed) でもプレーンオブジェクトでも OK。
 * コンポーネント破棄時に自動で登録解除される。
 */
export function useWindowExternalFile(
  source: (() => WindowExternalFile | null) | Ref<WindowExternalFile | null>,
) {
  const target = inject(WINDOW_EXTERNAL_FILE_KEY, null)
  if (!target) return
  watchEffect(() => {
    target.value = typeof source === 'function' ? source() : source.value
  })
  onScopeDispose(() => {
    target.value = null
  })
}
