import type { AiFileConfig } from '@/composables/useAiConfig'

/**
 * settings.json の型定義。VSCode `settings.json` と同じく、トップレベルは
 * フラット dot-notation キー空間 (`theme.manual`, `modes.realtime` 等)。
 *
 * 設計原則・長期ゴールは [DESIGN.md](../../DESIGN.md) の
 * 「settings.json — VSCode settings.json 相当の統合設定ファイル」節を参照。
 *
 * performance 設定は `performance.json5` に分離済み（独立ファイル）。
 * keybinds 設定は `keybinds.json5` に分離済み（独立ファイル）。
 */
export interface NotedeckSettings {
  /** スキーマバージョン。破壊的変更時に bump してマイグレーションを行う。 */
  _schema: number

  // --- Theme (Next 1 移行済み、dual-write + reconcile) ---
  'theme.manual'?: 'dark' | 'light' | null
  'theme.selectedDarkThemeId'?: string | null
  'theme.selectedLightThemeId'?: string | null

  // --- Deck (Next 1 移行済み) ---
  'deck.wallpaper'?: string | null
  'deck.activeProfileId'?: string | null

  // --- Modes (PoC 移行済み) ---
  'modes.realtime'?: boolean
  'modes.offline'?: boolean

  // --- AI (Next 3 移行済み、dual-write、API キーは除外) ---
  ai?: AiFileConfig

  // keybinds は keybinds.json5 に分離済み（独立ファイル）
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
