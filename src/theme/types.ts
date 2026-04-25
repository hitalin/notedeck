/**
 * NoteDeck 独自のテーマメタ。
 * 本家 Misskey は知らないフィールドだが registry sync (JSON) でパススルーされ
 * るため Web UI と双方向同期しても破壊されない。
 */
export interface NotedeckThemeMeta {
  /** misstore からインストールされた場合の追跡 ID (将来の自動更新用) */
  storeId?: string
}

export interface MisskeyTheme {
  id: string
  name: string
  base?: 'light' | 'dark'
  props: Record<string, string>
  /** NoteDeck 独自拡張 (本家は無視、registry sync では保持される) */
  $notedeck?: NotedeckThemeMeta
}

export type CompiledProps = Record<string, string>

export interface ThemeSource {
  kind:
    | 'builtin-dark'
    | 'builtin-light'
    | 'server-dark'
    | 'server-light'
    | 'custom-dark'
    | 'custom-light'
  host?: string
  theme: MisskeyTheme
}
