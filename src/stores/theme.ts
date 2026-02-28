import { invoke } from '@tauri-apps/api/core'
import { defineStore } from 'pinia'
import { ref, shallowRef } from 'vue'
import { applyTheme } from '@/theme/applier'
import { DARK_THEME, LIGHT_THEME } from '@/theme/builtinThemes'
import { compileMisskeyTheme } from '@/theme/compiler'
import type { CompiledProps, MisskeyTheme, ThemeSource } from '@/theme/types'

const STORAGE_COMPILED_KEY = 'nd-theme-compiled'

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
  // shallowRef + full Map replacement ensures Vue always detects changes
  const accountThemeCache = shallowRef(
    new Map<string, { dark?: MisskeyTheme; light?: MisskeyTheme }>(),
  )

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

    // Apply theme based on OS preference
    applyOsTheme()

    // Listen for OS dark/light mode changes
    window
      .matchMedia('(prefers-color-scheme: dark)')
      .addEventListener('change', () => applyOsTheme())
  }

  function applyOsTheme(): void {
    const prefersDark = window.matchMedia(
      '(prefers-color-scheme: dark)',
    ).matches
    if (prefersDark) {
      applySource({ kind: 'builtin-dark', theme: DARK_THEME })
    } else {
      applySource({ kind: 'builtin-light', theme: LIGHT_THEME })
    }
  }

  function applySource(source: ThemeSource): void {
    const base = source.kind.includes('light') ? LIGHT_THEME : DARK_THEME
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

      // 1. sync preferences
      if (data.syncDark) {
        const parsed = parseThemeFromData(data.syncDark)
        if (parsed)
          entry.dark = {
            ...parsed,
            id: `account-dark-${accountId}`,
            base: 'dark',
          }
      }
      if (data.syncLight) {
        const parsed = parseThemeFromData(data.syncLight)
        if (parsed)
          entry.light = {
            ...parsed,
            id: `account-light-${accountId}`,
            base: 'light',
          }
      }

      // 2. legacy base
      if (!entry.dark && data.baseDark) {
        const parsed = parseThemeFromData(data.baseDark)
        if (parsed)
          entry.dark = {
            ...parsed,
            id: `account-dark-${accountId}`,
            base: 'dark',
          }
      }
      if (!entry.light && data.baseLight) {
        const parsed = parseThemeFromData(data.baseLight)
        if (parsed)
          entry.light = {
            ...parsed,
            id: `account-light-${accountId}`,
            base: 'light',
          }
      }

      // 3. server meta defaults (JSON strings)
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
    } catch (e) {
      console.warn('[theme] Failed to fetch account theme:', accountId, e)
    } finally {
      fetchingAccounts.delete(accountId)
    }
  }

  function getAccountThemes(accountId: string) {
    return accountThemeCache.value.get(accountId) ?? null
  }

  const styleVarsCache = new Map<string, Record<string, string>>()

  function getStyleVarsForAccount(
    accountId: string,
  ): Record<string, string> | undefined {
    const wantLight = currentSource.value?.kind.includes('light') ?? false
    const cacheKey = `${accountId}:${wantLight ? 'light' : 'dark'}`

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
    const wantLight = currentSource.value?.kind.includes('light') ?? false
    const cacheKey = `${accountId}:${wantLight ? 'light' : 'dark'}`

    if (compiledCache.has(cacheKey)) return compiledCache.get(cacheKey) ?? null

    const cached = accountThemeCache.value.get(accountId)
    if (!cached) return null

    const theme = wantLight
      ? (cached.light ?? cached.dark)
      : (cached.dark ?? cached.light)
    if (!theme) return null

    const base = wantLight ? LIGHT_THEME : DARK_THEME
    const compiled = compileMisskeyTheme(theme, base)
    compiledCache.set(cacheKey, compiled)
    return compiled
  }

  return {
    currentSource,
    accountThemeCache,
    init,
    applySource,
    fetchAccountTheme,
    getAccountThemes,
    getCompiledForAccount,
    getStyleVarsForAccount,
  }
})
