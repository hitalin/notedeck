/**
 * notedeck.json の型定義。VSCode `settings.json` と同じく、トップレベルは
 * フラット dot-notation キー空間 (`theme.manual`, `modes.realtime` 等)。
 *
 * 設計原則・長期ゴールは [DESIGN.md](../../DESIGN.md) の
 * 「notedeck.json — VSCode settings.json 相当の統合設定ファイル」節を参照。
 *
 * 現段階 (PoC) では `realtimeMode` のみが実データを持ち、その他のキーは
 * 将来の移行を見越したスケルトン定義。ストアを段階的に移行するたびに
 * キーの入力/使用箇所が増えていく。
 */
export interface NotedeckSettings {
  /** スキーマバージョン。破壊的変更時に bump してマイグレーションを行う。 */
  _schema: number

  // --- Theme (Phase 2 以降で移行予定) ---
  'theme.manual'?: 'dark' | 'light' | null
  'theme.selectedDarkThemeId'?: string | null
  'theme.selectedLightThemeId'?: string | null

  // --- Deck (Phase 2 以降で移行予定) ---
  'deck.wallpaper'?: string | null
  'deck.activeProfileId'?: string | null

  // --- Modes (Phase 1 — PoC 移行対象) ---
  'modes.realtime'?: boolean
  'modes.offline'?: boolean

  // --- 将来拡張 (Phase 3 以降で移行予定) ---
  // 'performance.*' — performance.json から統合
  // 'ai.*'          — ai.json から統合 (API キーは除外、現状の方針維持)
  // 'keybinds.*'    — keybinds.json5 から統合
}

/** 現在のスキーマバージョン。将来の破壊的変更時に bump する。 */
export const CURRENT_SCHEMA_VERSION = 1

/**
 * デフォルト設定値。未定義キーはすべてここにフォールバック。
 *
 * 原則: ソースコード内に散在している defaults は段階的にここに集約する
 * (`DESIGN.md` の「マイグレーション」節参照)。本 PR では realtimeMode /
 * offlineMode のみ。
 */
export const DEFAULT_SETTINGS: NotedeckSettings = {
  _schema: CURRENT_SCHEMA_VERSION,
  // 既存 realtimeMode ストアのデフォルトが true なので追従 (既存ユーザーの
  // 体験を変えない)
  'modes.realtime': true,
  'modes.offline': false,
}

/**
 * 未知のキーも forward-compat で保持する loose な型。
 * parseSettings が生 JSON を受け取る時に使う中間型。
 */
export type RawSettings = Record<string, unknown> & { _schema?: number }

/**
 * 生 JSON を NotedeckSettings に正規化する。型チェックは loose で、
 * 不正値はデフォルトにフォールバックする方針 (壊れたファイルで
 * アプリが起動不能にならないように)。
 *
 * 未知のキーは保持される (forward-compat)。スキーマバージョンの
 * マイグレーションはここで行う (現状は v1 のみ)。
 */
export function parseSettings(raw: unknown): NotedeckSettings {
  if (!raw || typeof raw !== 'object') {
    return { ...DEFAULT_SETTINGS }
  }
  const r = raw as RawSettings
  return {
    ...DEFAULT_SETTINGS,
    ...r,
    _schema: typeof r._schema === 'number' ? r._schema : CURRENT_SCHEMA_VERSION,
  }
}
