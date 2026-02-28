export type UiComponentType =
  | 'text'
  | 'mfm'
  | 'button'
  | 'textInput'
  | 'numberInput'
  | 'switch'
  | 'select'
  | 'container'
  | 'folder'

export interface UiComponent {
  id: string
  type: UiComponentType
  props: Record<string, unknown>
  children?: UiComponent[]
}
