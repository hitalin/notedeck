import {
  type InjectionKey,
  inject,
  onScopeDispose,
  provide,
  type Ref,
  ref,
  watchEffect,
} from 'vue'

export interface WindowEditAction {
  onClick: () => void
  /** title 属性。省略時は '編集' */
  title?: string
  /** tabler アイコン名 (ti- 接頭辞なし)。省略時は 'pencil' */
  icon?: string
  disabled?: boolean
}

export const WINDOW_EDIT_ACTION_KEY: InjectionKey<
  Ref<WindowEditAction | null>
> = Symbol('windowEditAction')

/** DeckWindow 側で provide する。戻り値を読んでヘッダーボタンを描画する。 */
export function provideWindowEditAction() {
  const target = ref<WindowEditAction | null>(null)
  provide(WINDOW_EDIT_ACTION_KEY, target)
  return target
}

/**
 * Content コンポーネントから「編集」ヘッダーボタンを登録する。
 * `source` は ref/computed またはプレーン関数。未登録状態に戻すときは null を返す。
 * スコープ破棄時に自動で登録解除される。
 */
export function useWindowEditAction(
  source: (() => WindowEditAction | null) | Ref<WindowEditAction | null>,
) {
  const target = inject(WINDOW_EDIT_ACTION_KEY, null)
  if (!target) return
  watchEffect(() => {
    target.value = typeof source === 'function' ? source() : source.value
  })
  onScopeDispose(() => {
    target.value = null
  })
}
