/**
 * useSettingsStore — `settings.json` (VSCode `settings.json` 相当) の Pinia ラッパー。
 *
 * 現段階は土台 PR。realtimeMode のみが実際にここを経由する。他のストアは
 * 次 PR 以降で段階的に移行していく。詳細は [DESIGN.md](../../DESIGN.md) の
 * 「マイグレーション」節、および memory/project_settings_as_files.md 参照。
 *
 * 動作:
 * - 起動時に `load()` で settings.json を読み込む (存在しなければ defaults)
 * - `set()` で値を更新すると debounce (300ms) 後に settings.json に書き戻す
 * - 不正値や IO エラーは defaults にフォールバック (起動不能を避ける)
 */

import { defineStore } from 'pinia'
import { ref, shallowRef } from 'vue'
import {
  CURRENT_SCHEMA_VERSION,
  DEFAULT_SETTINGS,
  type NotedeckSettings,
  parseSettings,
} from '@/settings/schema'
import { isTauri } from '@/utils/settingsFs'
import { commands, unwrap } from '@/utils/tauriInvoke'

const PERSIST_DEBOUNCE_MS = 300

export const useSettingsStore = defineStore('settings', () => {
  /** 現在の設定値 (load() 完了まで DEFAULT_SETTINGS のコピー) */
  const settings = shallowRef<NotedeckSettings>({ ...DEFAULT_SETTINGS })

  /** settings.json からの初期ロードが完了したか */
  const initialized = ref(false)

  /** 現在書き込み中か (UI の保存インジケータ等で参照) */
  const saving = ref(false)

  /** 直近の永続化エラー (成功時は null にリセット) */
  const lastError = ref<string | null>(null)

  let persistTimer: ReturnType<typeof setTimeout> | null = null

  /**
   * settings.json を読み込んで settings を初期化する。
   * 複数回呼ばれても idempotent (初回のみ実行)。
   * 読み込みに失敗したら defaults で続行する。
   */
  async function load(): Promise<void> {
    if (initialized.value) return

    // Web ビルド (非 Tauri) では settings.json が存在しないので defaults のまま
    if (!isTauri) {
      initialized.value = true
      return
    }

    try {
      const raw = unwrap(await commands.readNotedeckJson())
      if (raw.length === 0) {
        settings.value = { ...DEFAULT_SETTINGS }
      } else {
        settings.value = parseSettings(JSON.parse(raw))
      }
    } catch (e) {
      console.warn(
        '[settings] failed to load settings.json, using defaults:',
        e,
      )
      settings.value = { ...DEFAULT_SETTINGS }
    }
    initialized.value = true
  }

  /**
   * スカラー設定を取得する。
   * 未定義キーは `undefined` を返す (呼び出し側でデフォルトを補う想定)。
   */
  function get<K extends keyof NotedeckSettings>(
    key: K,
  ): NotedeckSettings[K] | undefined {
    return settings.value[key]
  }

  /**
   * スカラー設定を更新する。shallowRef の reactivity をトリガーするため
   * 新オブジェクトを代入してから debounce 付きで永続化する。
   */
  function set<K extends keyof NotedeckSettings>(
    key: K,
    value: NotedeckSettings[K],
  ): void {
    settings.value = { ...settings.value, [key]: value }
    schedulePersist()
  }

  function schedulePersist(): void {
    if (persistTimer != null) clearTimeout(persistTimer)
    persistTimer = setTimeout(() => {
      persistTimer = null
      persist().catch((e) => {
        console.warn('[settings] persist failed:', e)
        lastError.value = e instanceof Error ? e.message : String(e)
      })
    }, PERSIST_DEBOUNCE_MS)
  }

  async function persist(): Promise<void> {
    if (!isTauri) return // Web ビルドでは no-op

    saving.value = true
    try {
      const toWrite = {
        ...settings.value,
        _schema: CURRENT_SCHEMA_VERSION,
      }
      const content = `${JSON.stringify(toWrite, null, 2)}\n`
      unwrap(await commands.writeNotedeckJson(content))
      lastError.value = null
    } finally {
      saving.value = false
    }
  }

  /**
   * ペンディング中の書き込みを即座にフラッシュする。
   * アプリ終了前など、debounce を待たずに確実に書き出したい時に呼ぶ。
   */
  async function flush(): Promise<void> {
    if (persistTimer != null) {
      clearTimeout(persistTimer)
      persistTimer = null
      await persist()
    }
  }

  return {
    settings,
    initialized,
    saving,
    lastError,
    load,
    get,
    set,
    flush,
  }
})
