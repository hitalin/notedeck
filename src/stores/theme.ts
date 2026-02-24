import { defineStore } from 'pinia'
import { ref, shallowRef } from 'vue'
import type { CompiledProps, MisskeyTheme, ThemeSource } from '@/theme/types'
import { compileMisskeyTheme } from '@/theme/compiler'
import { applyTheme } from '@/theme/applier'
import { DARK_THEME, LIGHT_THEME } from '@/theme/builtinThemes'

const STORAGE_SOURCE_KEY = 'nd-theme-source'
const STORAGE_COMPILED_KEY = 'nd-theme-compiled'

// Keyed by "accountId:dark" / "accountId:light"
const compiledCache = new Map<string, CompiledProps>()
const fetchingAccounts = new Set<string>()

/** Parse a theme object from various response formats */
function parseThemeFromData(data: unknown): MisskeyTheme | null {
  if (!data || typeof data !== 'object') return null

  // Direct theme object: { name, props, ... }
  if ('props' in data && typeof (data as Record<string, unknown>).props === 'object') {
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

export const useThemeStore = defineStore('theme', () => {
  const currentSource = ref<ThemeSource | null>(null)
  // shallowRef + full Map replacement ensures Vue always detects changes
  const accountThemeCache = shallowRef(new Map<string, { dark?: MisskeyTheme; light?: MisskeyTheme }>())

  function init(): void {
    const storedSource = localStorage.getItem(STORAGE_SOURCE_KEY)
    let source: ThemeSource | null = null
    if (storedSource) {
      try {
        const parsed = JSON.parse(storedSource) as ThemeSource
        // Only restore builtin themes; server themes should not be the global base
        if (parsed.kind === 'builtin-dark' || parsed.kind === 'builtin-light') {
          source = parsed
        }
      } catch { /* ignore */ }
    }

    if (source) {
      // Restore compiled CSS from localStorage (sync, FOUC prevention)
      const storedCompiled = localStorage.getItem(STORAGE_COMPILED_KEY)
      if (storedCompiled) {
        try {
          applyTheme(JSON.parse(storedCompiled) as CompiledProps)
        } catch { /* ignore corrupt data */ }
      }
      currentSource.value = source
    } else {
      // Default or reset from invalid server theme
      applySource({ kind: 'builtin-dark', theme: DARK_THEME })
    }
  }

  function applySource(source: ThemeSource): void {
    const base = source.kind.includes('light') ? LIGHT_THEME : DARK_THEME
    const compiled = compileMisskeyTheme(source.theme, base)
    applyTheme(compiled)
    compiledCache.clear()
    currentSource.value = source
    localStorage.setItem(STORAGE_SOURCE_KEY, JSON.stringify(source))
    localStorage.setItem(STORAGE_COMPILED_KEY, JSON.stringify(compiled))
  }

  async function fetchAccountTheme(accountId: string, host: string, token: string): Promise<void> {
    if (accountThemeCache.value.has(accountId)) return
    if (fetchingAccounts.has(accountId)) return
    fetchingAccounts.add(accountId)

    try {
      const entry: { dark?: MisskeyTheme; light?: MisskeyTheme } = {}

      // 1. Try new preferences sync via get-all (avoids 400 errors from get)
      const syncAll = await fetchRegistryAll(host, token, ['client', 'preferences', 'sync'])
      if (syncAll) {
        const darkData = syncAll['default:darkTheme']
        const lightData = syncAll['default:lightTheme']
        if (darkData) {
          const parsed = parseThemeFromData(darkData)
          if (parsed) entry.dark = { ...parsed, id: `account-dark-${accountId}`, base: 'dark' }
        }
        if (lightData) {
          const parsed = parseThemeFromData(lightData)
          if (parsed) entry.light = { ...parsed, id: `account-light-${accountId}`, base: 'light' }
        }
      }

      // 2. Try legacy Pizzax/ColdDeviceStorage via get-all
      if (!entry.dark && !entry.light) {
        const baseAll = await fetchRegistryAll(host, token, ['client', 'base'])
        if (baseAll) {
          const darkData = baseAll['darkTheme']
          const lightData = baseAll['lightTheme']
          if (darkData) {
            const parsed = parseThemeFromData(darkData)
            if (parsed) entry.dark = { ...parsed, id: `account-dark-${accountId}`, base: 'dark' }
          }
          if (lightData) {
            const parsed = parseThemeFromData(lightData)
            if (parsed) entry.light = { ...parsed, id: `account-light-${accountId}`, base: 'light' }
          }
        }
      }

      // 3. Fall back to server defaults from /api/meta
      if (!entry.dark && !entry.light) {
        const defaults = await fetchServerDefaults(host, token)
        if (defaults.dark) entry.dark = defaults.dark
        if (defaults.light) entry.light = defaults.light
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

  function getCompiledForAccount(accountId: string): CompiledProps | null {
    const wantLight = currentSource.value?.kind.includes('light') ?? false
    const cacheKey = `${accountId}:${wantLight ? 'light' : 'dark'}`

    if (compiledCache.has(cacheKey)) return compiledCache.get(cacheKey)!

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
  }
})

/** Fetch all keys in a registry scope (returns 200 with {} when empty, no 400 errors) */
async function fetchRegistryAll(host: string, token: string, scope: string[]): Promise<Record<string, unknown> | null> {
  try {
    const res = await fetch(`https://${host}/api/i/registry/get-all`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ i: token, scope }),
    })
    if (!res.ok) return null
    const data = await res.json()
    if (typeof data !== 'object' || data === null) return null
    // Return null if empty
    if (Object.keys(data as Record<string, unknown>).length === 0) return null
    return data as Record<string, unknown>
  } catch {
    return null
  }
}

/** Fetch server default themes from /api/meta */
async function fetchServerDefaults(host: string, token: string): Promise<{ dark?: MisskeyTheme; light?: MisskeyTheme }> {
  const result: { dark?: MisskeyTheme; light?: MisskeyTheme } = {}
  const res = await fetch(`https://${host}/api/meta`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ i: token }),
  })
  if (!res.ok) return result
  const meta = await res.json()

  if (meta.defaultDarkTheme) {
    try {
      const parsed = JSON.parse(meta.defaultDarkTheme)
      result.dark = {
        id: `server-dark-${host}`,
        name: parsed.name || 'Server Dark',
        base: 'dark',
        props: parsed.props || {},
      }
    } catch { /* invalid theme JSON */ }
  }
  if (meta.defaultLightTheme) {
    try {
      const parsed = JSON.parse(meta.defaultLightTheme)
      result.light = {
        id: `server-light-${host}`,
        name: parsed.name || 'Server Light',
        base: 'light',
        props: parsed.props || {},
      }
    } catch { /* invalid theme JSON */ }
  }

  return result
}
