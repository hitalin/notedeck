import { defineStore } from 'pinia'
import { computed, ref, shallowRef } from 'vue'
import { useAccountRegistryStore } from '@/stores/accountRegistry'
import { useSettingsStore } from '@/stores/settings'
import * as themeFileSync from '@/stores/themeFileSync'
import { applyTheme } from '@/theme/applier'
import {
  DARK_BASE,
  DARK_THEME,
  LIGHT_BASE,
  LIGHT_THEME,
} from '@/theme/builtinThemes'
import { compileMisskeyTheme } from '@/theme/compiler'
import { CustomCssManager } from '@/theme/cssApplier'
import type { CompiledProps, MisskeyTheme, ThemeSource } from '@/theme/types'
import * as settingsFs from '@/utils/settingsFs'
import {
  getStorageJson,
  getStorageString,
  STORAGE_KEYS,
  setStorageJson,
  setStorageString,
} from '@/utils/storage'
import { commands, unwrap } from '@/utils/tauriInvoke'

// Moved inside defineStore below to isolate per-window instance.
// (Module-level Maps leak data between Tauri multi-window contexts.)

interface ThemeResponse {
  syncDark?: unknown
  syncLight?: unknown
  baseDark?: unknown
  baseLight?: unknown
  metaDark?: string
  metaLight?: string
}

/** Parse a theme object from various response formats */
function parseThemeFromData(data: unknown): MisskeyTheme | null {
  if (!data || typeof data !== 'object') return null

  // Direct theme object: { name, props, ... }
  if (
    'props' in data &&
    typeof (data as Record<string, unknown>).props === 'object'
  ) {
    const d = data as Record<string, unknown>
    return {
      id: String(d.id ?? ''),
      name: String(d.name ?? ''),
      base: d.base === 'light' ? 'light' : 'dark',
      props: d.props as Record<string, string>,
    }
  }

  // Prefer system: [[scope, themeObject], ...] format
  if (Array.isArray(data)) {
    for (const entry of data) {
      if (Array.isArray(entry) && entry.length >= 2) {
        const result = parseThemeFromData(entry[1])
        if (result) return result
      }
    }
  }

  return null
}

/** Parse a JSON string theme from /api/meta defaults */
function parseMetaTheme(
  raw: string,
  id: string,
  base: 'dark' | 'light',
): MisskeyTheme | null {
  try {
    const parsed = JSON.parse(raw)
    return {
      id,
      name: parsed.name || `Server ${base === 'dark' ? 'Dark' : 'Light'}`,
      base,
      props: parsed.props || {},
    }
  } catch {
    return null
  }
}

export const useThemeStore = defineStore('theme', () => {
  const settingsStore = useSettingsStore()

  // Per-store-instance caches (isolated per window)
  const compiledCache = new Map<string, CompiledProps>()
  const fetchingAccounts = new Set<string>()

  const currentSource = ref<ThemeSource | null>(null)

  // settingsStore が single source of truth。FOUC 防止は compiled cache
  // (nd-theme-compiled) が担うので、これらの computed は await 済みの
  // settingsStore から正確な値を返す。
  const manualMode = computed<'dark' | 'light' | null>({
    get: () => settingsStore.get('theme.manual') ?? null,
    set: (v) => settingsStore.set('theme.manual', v),
  })
  const selectedDarkThemeId = computed<string | null>({
    get: () => settingsStore.get('theme.selectedDarkThemeId') ?? null,
    set: (v) => settingsStore.set('theme.selectedDarkThemeId', v),
  })
  const selectedLightThemeId = computed<string | null>({
    get: () => settingsStore.get('theme.selectedLightThemeId') ?? null,
    set: (v) => settingsStore.set('theme.selectedLightThemeId', v),
  })

  // shallowRef + full Map replacement ensures Vue always detects changes
  const accountThemeCache = shallowRef(
    new Map<string, { dark?: MisskeyTheme; light?: MisskeyTheme }>(),
  )

  // User-installed custom themes.
  // shallowRef: テーマは props (CSS 変数 Record) を多数持つため、deep reactive
  // でラップすると N テーマ × ~50 プロパティ分の Proxy 生成コストが発生する。
  // 本ストアではリスト自体の入れ替えのみ行い、テーマオブジェクト内部の
  // in-place 更新は行わないため shallowRef で十分。
  const installedThemes = shallowRef<MisskeyTheme[]>([])
  // Custom CSS
  const customCss = ref('')
  // Whether file-based storage has been initialized
  const initialized = ref(false)

  function init(): void {
    // Restore compiled CSS from localStorage first (sync, FOUC prevention).
    // This is NOT a source of truth — just a rendering cache to avoid a
    // white flash. The actual theme preference comes from settingsStore
    // (already loaded via await in main.ts).
    const storedCompiled = getStorageJson<CompiledProps | null>(
      STORAGE_KEYS.themeCompiled,
      null,
    )
    if (storedCompiled) {
      applyTheme(storedCompiled)
    }

    // Restore installed themes (still localStorage-based, not in settingsStore)
    installedThemes.value = getStorageJson<MisskeyTheme[]>(
      STORAGE_KEYS.themeInstalledThemes,
      [],
    )

    // Restore custom CSS
    const storedCss = getStorageString(STORAGE_KEYS.themeCustomCss)
    if (storedCss) {
      customCss.value = storedCss
      applyCustomCss(storedCss)
    }

    // Apply theme (reads computed from settingsStore — correct values)
    applyCurrentTheme()

    // Defer account theme cache restoration (not needed for initial render)
    queueMicrotask(() => {
      const entries = getStorageJson<
        [string, { dark?: MisskeyTheme; light?: MisskeyTheme }][]
      >(STORAGE_KEYS.themeAccountThemes, [])
      if (entries.length > 0) {
        try {
          accountThemeCache.value = new Map(entries)
        } catch {
          /* ignore corrupt data */
        }
      }
    })

    // Listen for OS dark/light mode changes (only applies when following OS)
    window
      .matchMedia('(prefers-color-scheme: dark)')
      .addEventListener('change', () => {
        if (manualMode.value == null) applyCurrentTheme()
      })

    // Kick off async file sync in background (Tauri only)
    if (settingsFs.isTauri) {
      initFileStorage().catch((e) =>
        console.warn('[theme] file storage init failed:', e),
      )
    } else {
      initialized.value = true
    }
  }

  function wantsDark(): boolean {
    return manualMode.value != null
      ? manualMode.value === 'dark'
      : window.matchMedia('(prefers-color-scheme: dark)').matches
  }

  function applyCurrentTheme(): void {
    const dark = wantsDark()
    const selectedId = dark
      ? selectedDarkThemeId.value
      : selectedLightThemeId.value
    const custom = selectedId
      ? installedThemes.value.find((t) => t.id === selectedId)
      : null
    if (custom) {
      applySource({
        kind: dark ? 'custom-dark' : 'custom-light',
        theme: custom,
      })
    } else {
      applySource({
        kind: dark ? 'builtin-dark' : 'builtin-light',
        theme: dark ? DARK_THEME : LIGHT_THEME,
      })
    }
  }

  function isCurrentDark(): boolean {
    return currentSource.value?.kind.includes('light') === false
  }

  function toggleTheme(): void {
    // computed setter → settingsStore.set() → settings.json persist
    manualMode.value = isCurrentDark() ? 'light' : 'dark'
    applyCurrentTheme()
  }

  function resetToOsTheme(): void {
    manualMode.value = null
    applyCurrentTheme()
  }

  /** Lock current appearance as manual mode (stop following OS) */
  function pinCurrentMode(): void {
    manualMode.value = isCurrentDark() ? 'dark' : 'light'
  }

  /** Install a Misskey theme from JSON code. Returns true on success. */
  async function installTheme(code: string): Promise<boolean> {
    try {
      const JSON5 = (await import('json5')).default
      const parsed = JSON5.parse(code)
      if (!parsed || typeof parsed !== 'object' || !parsed.props) return false

      const theme: MisskeyTheme = {
        id: parsed.id || `custom-${Date.now()}`,
        name: parsed.name || 'Untitled',
        base: parsed.base === 'light' ? 'light' : 'dark',
        props: parsed.props,
      }
      // NoteDeck 独自メタ ($notedeck) はパススルー (misstore からの storeId 等)
      if (parsed.$notedeck && typeof parsed.$notedeck === 'object') {
        theme.$notedeck = { ...parsed.$notedeck }
      }

      // Avoid duplicates
      if (installedThemes.value.some((t) => t.id === theme.id)) {
        installedThemes.value = installedThemes.value.map((t) =>
          t.id === theme.id ? theme : t,
        )
      } else {
        installedThemes.value = [...installedThemes.value, theme]
      }
      // Sync: localStorage cache
      setStorageJson(STORAGE_KEYS.themeInstalledThemes, installedThemes.value)
      // Async: write only the changed theme to file
      if (initialized.value) {
        themeFileSync
          .persistSingleTheme(theme)
          .catch((e) => console.warn('[theme] failed to persist theme:', e))
      }
      return true
    } catch {
      return false
    }
  }

  function removeTheme(id: string): void {
    const removed = installedThemes.value.find((t) => t.id === id)
    installedThemes.value = installedThemes.value.filter((t) => t.id !== id)
    // Clear selection if removed (computed setter → settingsStore)
    if (selectedDarkThemeId.value === id) {
      selectedDarkThemeId.value = null
    }
    if (selectedLightThemeId.value === id) {
      selectedLightThemeId.value = null
    }
    // Sync: update localStorage cache only (no need to rewrite remaining theme files)
    setStorageJson(STORAGE_KEYS.themeInstalledThemes, installedThemes.value)
    applyCurrentTheme()
    // Async: delete the removed theme file
    if (initialized.value && removed) {
      themeFileSync
        .deleteThemeFile(removed)
        .catch((e) => console.warn('[theme] failed to delete theme file:', e))
    }
  }

  function renameTheme(themeId: string, newName: string): void {
    const theme = installedThemes.value.find((t) => t.id === themeId)
    if (!theme) return

    const oldFilename = settingsFs.themeFilename(theme.name || theme.id)
    theme.name = newName
    const newFilename = settingsFs.themeFilename(newName)

    setStorageJson(STORAGE_KEYS.themeInstalledThemes, installedThemes.value)

    if (initialized.value && oldFilename !== newFilename) {
      // Delete old file and write new one (theme id stays the same, only name changes)
      Promise.all([
        settingsFs.deleteTheme(oldFilename),
        themeFileSync.persistSingleTheme(theme),
      ]).catch((e) => console.warn('[theme] failed to rename theme file:', e))
    }
  }

  function selectTheme(id: string | null, mode: 'dark' | 'light'): void {
    // computed setter → settingsStore.set() → settings.json persist
    if (mode === 'dark') {
      selectedDarkThemeId.value = id
    } else {
      selectedLightThemeId.value = id
    }
    applyCurrentTheme()
  }

  /**
   * 指定アカウントのカラム単位 per-account テーマを設定する。
   * 本家 Misskey Web UI 互換 scope (['client','preferences','sync']) の
   * theme:dark / theme:light に theme object を書き込み、accountThemeCache も
   * 同期更新する。
   *
   * 反映先は **そのアカウントを accountId に持つカラム / 派生 UI のみ** で、
   * デッキ全体 (アカウント非依存領域) のテーマは触らない。カラム側は
   * useColumnTheme + getStyleVarsForAccount が accountThemeCache の変更を
   * 検知して再描画する。
   *
   * registry write が失敗してもローカル反映は行う (オフライン許容)。
   */
  async function applyAccountTheme(
    theme: MisskeyTheme,
    mode: 'dark' | 'light',
    accountId: string,
  ): Promise<void> {
    // accountThemeCache を即時更新 (UI 反映を先に)
    const next = new Map(accountThemeCache.value)
    const entry = { ...(next.get(accountId) ?? {}) }
    const stored: MisskeyTheme = {
      ...theme,
      id: `account-${mode}-${accountId}`,
      base: mode,
    }
    entry[mode] = stored
    next.set(accountId, entry)
    accountThemeCache.value = next
    compiledCache.clear()
    styleVarsCache.clear()
    persistAccountThemes()

    // registry に書き込み (本家 Web UI が読める形式 + $notedeck パススルー)
    const registry = useAccountRegistryStore()
    try {
      const payload: Record<string, unknown> = {
        id: theme.id,
        name: theme.name,
        base: mode,
        props: theme.props,
      }
      if (theme.$notedeck) payload.$notedeck = theme.$notedeck
      await registry.set(
        accountId,
        ['client', 'preferences', 'sync'],
        `theme:${mode}`,
        payload as never,
      )
    } catch (e) {
      if (import.meta.env.DEV) {
        console.warn('[theme] registry write failed:', accountId, mode, e)
      }
    }
  }

  /**
   * 指定アカウントのカラム単位 per-account テーマを解除する。
   * accountThemeCache から削除し、registry からも削除する。
   * 削除後、そのアカウントのカラムは fetchAccountTheme 経由のサーバー設定
   * (もしくは builtin) に戻る。
   */
  async function clearAccountTheme(
    mode: 'dark' | 'light',
    accountId: string,
  ): Promise<void> {
    const cached = accountThemeCache.value.get(accountId)
    if (cached?.[mode]) {
      const next = new Map(accountThemeCache.value)
      const entry = { ...cached }
      delete entry[mode]
      if (entry.dark || entry.light) {
        next.set(accountId, entry)
      } else {
        next.delete(accountId)
      }
      accountThemeCache.value = next
      compiledCache.clear()
      styleVarsCache.clear()
      persistAccountThemes()
    }

    const registry = useAccountRegistryStore()
    try {
      await registry.remove(
        accountId,
        ['client', 'preferences', 'sync'],
        `theme:${mode}`,
      )
    } catch (e) {
      if (import.meta.env.DEV) {
        console.warn('[theme] registry remove failed:', accountId, mode, e)
      }
    }
  }

  function setCustomCss(css: string): void {
    customCss.value = css
    setStorageString(STORAGE_KEYS.themeCustomCss, css || null)
    applyCustomCss(css)
    if (initialized.value) {
      themeFileSync
        .writeCustomCssFile(css)
        .catch((e) => console.warn('[theme] failed to write custom.css:', e))
    }
  }

  const cssManager = new CustomCssManager()

  function applyCustomCss(css: string): void {
    cssManager.apply(css)
  }

  function applySource(source: ThemeSource): void {
    const wasDark = isCurrentDark()
    const base = source.kind.includes('light') ? LIGHT_BASE : DARK_BASE
    const compiled = compileMisskeyTheme(source.theme, base)
    applyTheme(compiled)

    // Invalidate account theme caches only when dark/light mode changes,
    // since the base theme used for compilation differs between modes.
    // Same-mode switches (e.g. dark A → dark B) keep account caches valid.
    const nowDark = !source.kind.includes('light')
    if (wasDark !== nowDark) {
      compiledCache.clear()
      styleVarsCache.clear()
    }

    currentSource.value = source
    setStorageJson(STORAGE_KEYS.themeCompiled, compiled)
  }

  async function fetchAccountTheme(accountId: string): Promise<void> {
    if (accountThemeCache.value.has(accountId)) return
    if (fetchingAccounts.has(accountId)) return
    fetchingAccounts.add(accountId)

    try {
      const data = unwrap(
        await commands.apiFetchAccountTheme(accountId),
      ) as ThemeResponse
      if (import.meta.env.DEV) {
        console.debug('[theme] fetchAccountTheme raw data', accountId, data)
      }
      const entry: { dark?: MisskeyTheme; light?: MisskeyTheme } = {}

      // Try each source in priority order: sync > base > meta
      function trySet(mode: 'dark' | 'light', rawData: unknown) {
        if (entry[mode]) return
        const parsed = parseThemeFromData(rawData)
        if (parsed) {
          entry[mode] = {
            ...parsed,
            id: `account-${mode}-${accountId}`,
            base: mode,
          }
        }
      }

      trySet('dark', data.syncDark)
      trySet('light', data.syncLight)
      trySet('dark', data.baseDark)
      trySet('light', data.baseLight)

      // Server meta defaults (JSON strings)
      if (!entry.dark && data.metaDark) {
        entry.dark =
          parseMetaTheme(data.metaDark, `server-dark-${accountId}`, 'dark') ??
          undefined
      }
      if (!entry.light && data.metaLight) {
        entry.light =
          parseMetaTheme(
            data.metaLight,
            `server-light-${accountId}`,
            'light',
          ) ?? undefined
      }

      const next = new Map(accountThemeCache.value)
      next.set(accountId, entry)
      accountThemeCache.value = next

      // Invalidate compiled caches so new theme data takes effect
      compiledCache.clear()
      styleVarsCache.clear()

      // Persist to localStorage for instant restore on next launch
      persistAccountThemes()
    } catch (e) {
      if (import.meta.env.DEV) {
        console.debug('[theme] Failed to fetch account theme:', accountId, e)
      }
    } finally {
      fetchingAccounts.delete(accountId)
    }
  }

  /**
   * DEV 用: 本家最新の preferences cloud sync で「マイテーマ一覧」がどの
   * key で saved されているかを実機で特定するための一時 debug 関数。
   * useTheme から呼ばれ、本来の fetchAccountTheme のテストには影響しない。
   */
  async function debugLogAccountRegistryKeys(accountId: string): Promise<void> {
    if (!import.meta.env.DEV) return
    const registry = useAccountRegistryStore()
    try {
      const sync = await registry.listKeys(accountId, [
        'client',
        'preferences',
        'sync',
      ])
      console.debug(
        '[theme] sync scope keys for',
        accountId,
        JSON.stringify(Object.keys(sync)),
      )
    } catch (e) {
      console.debug('[theme] sync scope listKeys failed:', e)
    }
    try {
      const base = await registry.listKeys(accountId, ['client', 'base'])
      console.debug(
        '[theme] base scope keys for',
        accountId,
        JSON.stringify(Object.keys(base)),
      )
    } catch (e) {
      console.debug('[theme] base scope listKeys failed:', e)
    }
  }

  // QuotaExceededError が一度出たら以降の persist は skip。
  // 毎回試行→失敗→ログ汚染を避けるため。in-memory cache は維持される。
  let accountThemesPersistDisabled = false

  function persistAccountThemes(): void {
    if (accountThemesPersistDisabled) return
    const entries = Array.from(accountThemeCache.value.entries())
    try {
      setStorageJson(STORAGE_KEYS.themeAccountThemes, entries)
    } catch (e) {
      accountThemesPersistDisabled = true
      if (import.meta.env.DEV) {
        console.warn('[theme] persistAccountThemes disabled (likely quota):', e)
      }
    }
  }

  /** Load themes from files and custom CSS. Files are source of truth. */
  async function initFileStorage(): Promise<void> {
    const data = await themeFileSync.loadFromFiles()

    if (data.themes.length > 0) {
      installedThemes.value = data.themes
      setStorageJson(STORAGE_KEYS.themeInstalledThemes, data.themes)
      applyCurrentTheme()
    }

    if (data.customCss) {
      customCss.value = data.customCss
      setStorageString(STORAGE_KEYS.themeCustomCss, data.customCss)
      applyCustomCss(data.customCss)
    }

    initialized.value = true

    // Migrate: if localStorage has themes but no files exist, write them
    if (data.needsMigrateThemes && installedThemes.value.length > 0) {
      themeFileSync
        .persistAllThemes(installedThemes.value)
        .catch((e) => console.warn('[theme] migration to files failed:', e))
    }
    // Migrate custom CSS to file if not yet written
    if (data.needsMigrateCss && customCss.value) {
      themeFileSync
        .writeCustomCssFile(customCss.value)
        .catch((e) => console.warn('[theme] CSS migration failed:', e))
    }
  }

  function getAccountThemes(accountId: string) {
    return accountThemeCache.value.get(accountId) ?? null
  }

  const styleVarsCache = new Map<string, Record<string, string>>()

  function accountCacheKey(accountId: string): string {
    return `${accountId}:${isCurrentDark() ? 'dark' : 'light'}`
  }

  function getStyleVarsForAccount(
    accountId: string,
  ): Record<string, string> | undefined {
    const cacheKey = accountCacheKey(accountId)

    const cached = styleVarsCache.get(cacheKey)
    if (cached) return cached

    const compiled = getCompiledForAccount(accountId)
    if (!compiled) return undefined
    const style: Record<string, string> = {}
    for (const [key, value] of Object.entries(compiled)) {
      style[`--nd-${key}`] = value
    }
    styleVarsCache.set(cacheKey, style)
    return style
  }

  function getCompiledForAccount(accountId: string): CompiledProps | null {
    const cacheKey = accountCacheKey(accountId)

    if (compiledCache.has(cacheKey)) return compiledCache.get(cacheKey) ?? null

    const cached = accountThemeCache.value.get(accountId)
    if (!cached) return null

    const dark = isCurrentDark()
    const theme = dark
      ? (cached.dark ?? cached.light)
      : (cached.light ?? cached.dark)
    if (!theme) return null

    const base = dark ? DARK_BASE : LIGHT_BASE
    const compiled = compileMisskeyTheme(theme, base)
    compiledCache.set(cacheKey, compiled)
    return compiled
  }

  return {
    currentSource,
    manualMode,
    accountThemeCache,
    installedThemes,
    selectedDarkThemeId,
    selectedLightThemeId,
    customCss,
    init,
    applySource,
    toggleTheme,
    resetToOsTheme,
    pinCurrentMode,
    installTheme,
    removeTheme,
    renameTheme,
    selectTheme,
    applyAccountTheme,
    clearAccountTheme,
    applyCurrentTheme,
    setCustomCss,
    fetchAccountTheme,
    debugLogAccountRegistryKeys,
    getAccountThemes,
    getCompiledForAccount,
    getStyleVarsForAccount,
  }
})
