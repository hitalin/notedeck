import { invoke } from '@tauri-apps/api/core'
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

const STORAGE_COMPILED_KEY = 'nd-theme-compiled'
const STORAGE_ACCOUNT_THEMES_KEY = 'nd-account-themes'
const STORAGE_MANUAL_THEME_KEY = 'nd-theme-manual'
const STORAGE_INSTALLED_THEMES_KEY = 'nd-installed-themes'
const STORAGE_SELECTED_DARK_KEY = 'nd-selected-dark-theme'
const STORAGE_SELECTED_LIGHT_KEY = 'nd-selected-light-theme'
const STORAGE_CUSTOM_CSS_KEY = 'nd-custom-css'

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

  function init(): void {
    // Restore compiled CSS from localStorage first (sync, FOUC prevention)
    const storedCompiled = localStorage.getItem(STORAGE_COMPILED_KEY)
    if (storedCompiled) {
      try {
        applyTheme(JSON.parse(storedCompiled) as CompiledProps)
      } catch {
        /* ignore corrupt data */
      }
    }

    // Restore manual theme preference
    const storedManual = localStorage.getItem(STORAGE_MANUAL_THEME_KEY)
    if (storedManual === 'dark' || storedManual === 'light') {
      manualMode.value = storedManual
    }

    // Restore installed themes & selections
    const storedThemes = localStorage.getItem(STORAGE_INSTALLED_THEMES_KEY)
    if (storedThemes) {
      try {
        installedThemes.value = JSON.parse(storedThemes) as MisskeyTheme[]
      } catch {
        /* ignore */
      }
    }
    selectedDarkThemeId.value = localStorage.getItem(STORAGE_SELECTED_DARK_KEY)
    selectedLightThemeId.value = localStorage.getItem(
      STORAGE_SELECTED_LIGHT_KEY,
    )

    // Restore custom CSS
    const storedCss = localStorage.getItem(STORAGE_CUSTOM_CSS_KEY)
    if (storedCss) {
      customCss.value = storedCss
      applyCustomCss(storedCss)
    }

    // Apply theme (manual or OS-based)
    applyCurrentTheme()

    // Defer account theme cache restoration (not needed for initial render)
    queueMicrotask(() => {
      const storedAccountThemes = localStorage.getItem(
        STORAGE_ACCOUNT_THEMES_KEY,
      )
      if (storedAccountThemes) {
        try {
          const entries = JSON.parse(storedAccountThemes) as [
            string,
            { dark?: MisskeyTheme; light?: MisskeyTheme },
          ][]
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
    localStorage.setItem(STORAGE_MANUAL_THEME_KEY, manualMode.value)
    applyCurrentTheme()
  }

  function resetToOsTheme(): void {
    manualMode.value = null
    localStorage.removeItem(STORAGE_MANUAL_THEME_KEY)
    applyCurrentTheme()
  }

  /** Lock current appearance as manual mode (stop following OS) */
  function pinCurrentMode(): void {
    manualMode.value = isCurrentDark() ? 'dark' : 'light'
    localStorage.setItem(STORAGE_MANUAL_THEME_KEY, manualMode.value)
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
      persistInstalledThemes()
      return true
    } catch {
      return false
    }
  }

  function removeTheme(id: string): void {
    installedThemes.value = installedThemes.value.filter((t) => t.id !== id)
    // Clear selection if removed
    if (selectedDarkThemeId.value === id) {
      selectedDarkThemeId.value = null
      localStorage.removeItem(STORAGE_SELECTED_DARK_KEY)
    }
    if (selectedLightThemeId.value === id) {
      selectedLightThemeId.value = null
      localStorage.removeItem(STORAGE_SELECTED_LIGHT_KEY)
    }
    persistInstalledThemes()
    applyCurrentTheme()
  }

  function selectTheme(id: string | null, mode: 'dark' | 'light'): void {
    if (mode === 'dark') {
      selectedDarkThemeId.value = id
      if (id) localStorage.setItem(STORAGE_SELECTED_DARK_KEY, id)
      else localStorage.removeItem(STORAGE_SELECTED_DARK_KEY)
    } else {
      selectedLightThemeId.value = id
      if (id) localStorage.setItem(STORAGE_SELECTED_LIGHT_KEY, id)
      else localStorage.removeItem(STORAGE_SELECTED_LIGHT_KEY)
    }
    applyCurrentTheme()
  }

  function persistInstalledThemes(): void {
    localStorage.setItem(
      STORAGE_INSTALLED_THEMES_KEY,
      JSON.stringify(installedThemes.value),
    )
  }

  function setCustomCss(css: string): void {
    customCss.value = css
    if (css) {
      localStorage.setItem(STORAGE_CUSTOM_CSS_KEY, css)
    } else {
      localStorage.removeItem(STORAGE_CUSTOM_CSS_KEY)
    }
    applyCustomCss(css)
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
    localStorage.setItem(STORAGE_COMPILED_KEY, JSON.stringify(compiled))
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
    localStorage.setItem(STORAGE_ACCOUNT_THEMES_KEY, JSON.stringify(entries))
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
