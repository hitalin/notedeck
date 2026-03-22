import { invoke } from '@tauri-apps/api/core'
import JSON5 from 'json5'
import { defineStore } from 'pinia'
import { ref, shallowRef } from 'vue'

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
  removeStorage,
  STORAGE_KEYS,
  setStorageJson,
  setStorageString,
} from '@/utils/storage'

// Keyed by "accountId:dark" / "accountId:light"
const compiledCache = new Map<string, CompiledProps>()
const fetchingAccounts = new Set<string>()

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
  const currentSource = ref<ThemeSource | null>(null)
  // 'dark' | 'light' | null (null = follow OS)
  const manualMode = ref<'dark' | 'light' | null>(null)
  // shallowRef + full Map replacement ensures Vue always detects changes
  const accountThemeCache = shallowRef(
    new Map<string, { dark?: MisskeyTheme; light?: MisskeyTheme }>(),
  )

  // User-installed custom themes
  const installedThemes = ref<MisskeyTheme[]>([])
  // Selected theme IDs per mode (null = builtin)
  const selectedDarkThemeId = ref<string | null>(null)
  const selectedLightThemeId = ref<string | null>(null)
  // Custom CSS
  const customCss = ref('')
  // Whether file-based storage has been initialized
  const initialized = ref(false)

  function init(): void {
    // Restore compiled CSS from localStorage first (sync, FOUC prevention)
    const storedCompiled = getStorageJson<CompiledProps | null>(
      STORAGE_KEYS.themeCompiled,
      null,
    )
    if (storedCompiled) {
      applyTheme(storedCompiled)
    }

    // Restore manual theme preference
    const storedManual = getStorageString(STORAGE_KEYS.themeManual)
    if (storedManual === 'dark' || storedManual === 'light') {
      manualMode.value = storedManual
    }

    // Restore installed themes & selections
    installedThemes.value = getStorageJson<MisskeyTheme[]>(
      STORAGE_KEYS.themeInstalledThemes,
      [],
    )
    selectedDarkThemeId.value = getStorageString(STORAGE_KEYS.themeSelectedDark)
    selectedLightThemeId.value = getStorageString(
      STORAGE_KEYS.themeSelectedLight,
    )

    // Restore custom CSS
    const storedCss = getStorageString(STORAGE_KEYS.themeCustomCss)
    if (storedCss) {
      customCss.value = storedCss
      applyCustomCss(storedCss)
    }

    // Apply theme (manual or OS-based)
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
    manualMode.value = isCurrentDark() ? 'light' : 'dark'
    setStorageString(STORAGE_KEYS.themeManual, manualMode.value)
    applyCurrentTheme()
  }

  function resetToOsTheme(): void {
    manualMode.value = null
    removeStorage(STORAGE_KEYS.themeManual)
    applyCurrentTheme()
  }

  /** Lock current appearance as manual mode (stop following OS) */
  function pinCurrentMode(): void {
    manualMode.value = isCurrentDark() ? 'dark' : 'light'
    setStorageString(STORAGE_KEYS.themeManual, manualMode.value)
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
        persistSingleTheme(theme).catch((e) =>
          console.warn('[theme] failed to persist theme:', e),
        )
      }
      return true
    } catch {
      return false
    }
  }

  function removeTheme(id: string): void {
    const removed = installedThemes.value.find((t) => t.id === id)
    installedThemes.value = installedThemes.value.filter((t) => t.id !== id)
    // Clear selection if removed
    if (selectedDarkThemeId.value === id) {
      selectedDarkThemeId.value = null
      removeStorage(STORAGE_KEYS.themeSelectedDark)
    }
    if (selectedLightThemeId.value === id) {
      selectedLightThemeId.value = null
      removeStorage(STORAGE_KEYS.themeSelectedLight)
    }
    persistInstalledThemes()
    applyCurrentTheme()
    // Delete file
    if (initialized.value && removed) {
      const filename = settingsFs.themeFilename(removed.name || removed.id)
      settingsFs
        .deleteTheme(filename)
        .catch((e) => console.warn('[theme] failed to delete theme file:', e))
    }
  }

  function selectTheme(id: string | null, mode: 'dark' | 'light'): void {
    if (mode === 'dark') {
      selectedDarkThemeId.value = id
      setStorageString(STORAGE_KEYS.themeSelectedDark, id)
    } else {
      selectedLightThemeId.value = id
      setStorageString(STORAGE_KEYS.themeSelectedLight, id)
    }
    applyCurrentTheme()
  }

  function persistInstalledThemes(): void {
    setStorageJson(STORAGE_KEYS.themeInstalledThemes, installedThemes.value)
    if (initialized.value) {
      persistThemesToFiles().catch((e) =>
        console.warn('[theme] failed to persist themes to files:', e),
      )
    }
  }

  /** Write all installed themes to individual files. */
  async function persistThemesToFiles(): Promise<void> {
    await Promise.all(
      installedThemes.value.map((theme) => persistSingleTheme(theme)),
    )
  }

  /** Write a single theme to file. */
  async function persistSingleTheme(theme: MisskeyTheme): Promise<void> {
    const filename = settingsFs.themeFilename(theme.name || theme.id)
    const content = JSON5.stringify(theme, null, 2)
    await settingsFs.writeTheme(filename, content)
  }

  function setCustomCss(css: string): void {
    customCss.value = css
    setStorageString(STORAGE_KEYS.themeCustomCss, css || null)
    applyCustomCss(css)
    if (initialized.value) {
      settingsFs
        .writeCustomCss(css)
        .catch((e) => console.warn('[theme] failed to write custom.css:', e))
    }
  }

  const cssManager = new CustomCssManager()

  function applyCustomCss(css: string): void {
    cssManager.apply(css)
  }

  function applySource(source: ThemeSource): void {
    const base = source.kind.includes('light') ? LIGHT_BASE : DARK_BASE
    const compiled = compileMisskeyTheme(source.theme, base)
    applyTheme(compiled)
    compiledCache.clear()
    styleVarsCache.clear()
    currentSource.value = source
    setStorageJson(STORAGE_KEYS.themeCompiled, compiled)
  }

  async function fetchAccountTheme(accountId: string): Promise<void> {
    if (accountThemeCache.value.has(accountId)) return
    if (fetchingAccounts.has(accountId)) return
    fetchingAccounts.add(accountId)

    try {
      const data = await invoke<ThemeResponse>('api_fetch_account_theme', {
        accountId,
      })
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
      console.warn('[theme] Failed to fetch account theme:', accountId, e)
    } finally {
      fetchingAccounts.delete(accountId)
    }
  }

  function persistAccountThemes(): void {
    const entries = Array.from(accountThemeCache.value.entries())
    setStorageJson(STORAGE_KEYS.themeAccountThemes, entries)
  }

  /** Load themes from files and custom CSS. Files are source of truth. */
  async function initFileStorage(): Promise<void> {
    // Load installed themes from files
    const filenames = await settingsFs.listThemes()
    if (filenames.length > 0) {
      const results = await Promise.all(
        filenames.map(async (filename) => {
          try {
            const content = await settingsFs.readTheme(filename)
            const parsed = JSON5.parse(content)
            if (parsed?.props) {
              return {
                id: parsed.id || `custom-${filename}`,
                name: parsed.name || filename,
                base: parsed.base === 'light' ? 'light' : 'dark',
                props: parsed.props,
              } as MisskeyTheme
            }
          } catch (e) {
            console.warn(`[theme] failed to parse ${filename}:`, e)
          }
          return null
        }),
      )
      const themes = results.filter((t): t is MisskeyTheme => t !== null)
      if (themes.length > 0) {
        installedThemes.value = themes
        setStorageJson(STORAGE_KEYS.themeInstalledThemes, themes)
        applyCurrentTheme()
      }
    }

    // Load custom CSS from file
    const fileCss = await settingsFs.readCustomCss()
    if (fileCss) {
      customCss.value = fileCss
      setStorageString(STORAGE_KEYS.themeCustomCss, fileCss)
      applyCustomCss(fileCss)
    }

    initialized.value = true

    // Migrate: if localStorage has themes but no files exist, write them
    if (filenames.length === 0 && installedThemes.value.length > 0) {
      persistThemesToFiles().catch((e) =>
        console.warn('[theme] migration to files failed:', e),
      )
    }
    // Migrate custom CSS to file if not yet written
    if (!fileCss && customCss.value) {
      settingsFs
        .writeCustomCss(customCss.value)
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
    selectTheme,
    setCustomCss,
    fetchAccountTheme,
    getAccountThemes,
    getCompiledForAccount,
    getStyleVarsForAccount,
  }
})
