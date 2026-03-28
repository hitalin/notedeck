/**
 * Type-safe localStorage helpers with error handling.
 * Centralizes the try-catch + JSON.parse/stringify pattern
 * repeated across multiple stores.
 */

/** Read and parse a JSON value from localStorage. Returns fallback on error or missing key. */
export function getStorageJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    if (raw != null) return JSON.parse(raw) as T
  } catch {
    /* corrupt data, ignore */
  }
  return fallback
}

/** Serialize a value to JSON and write to localStorage. */
export function setStorageJson(key: string, value: unknown): void {
  localStorage.setItem(key, JSON.stringify(value))
}

/** Read a plain string from localStorage. */
export function getStorageString(key: string): string | null {
  return localStorage.getItem(key)
}

/** Write a plain string to localStorage, or remove the key if value is null. */
export function setStorageString(key: string, value: string | null): void {
  if (value != null) {
    localStorage.setItem(key, value)
  } else {
    localStorage.removeItem(key)
  }
}

/** Remove a key from localStorage. */
export function removeStorage(key: string): void {
  localStorage.removeItem(key)
}

/** Remove all localStorage keys matching a prefix. */
export function removeStorageByPrefix(prefix: string): void {
  for (let i = localStorage.length - 1; i >= 0; i--) {
    const key = localStorage.key(i)
    if (key?.startsWith(prefix)) {
      localStorage.removeItem(key)
    }
  }
}

// ---------------------------------------------------------------------------
// Storage key registry
// ---------------------------------------------------------------------------
// All localStorage keys used by the app, in one place.
// Changing a key name here is the single point of update.
// ---------------------------------------------------------------------------

export const STORAGE_KEYS = {
  // Deck
  deck: 'nd-deck',
  deckProfiles: 'nd-deck-profiles',
  deckActiveProfile: 'nd-deck-active-profile',
  deckWallpaper: 'nd-deck-wallpaper',

  // Theme
  themeCompiled: 'nd-theme-compiled',
  themeManual: 'nd-theme-manual',
  themeInstalledThemes: 'nd-installed-themes',
  themeSelectedDark: 'nd-selected-dark-theme',
  themeSelectedLight: 'nd-selected-light-theme',
  themeCustomCss: 'nd-custom-css',
  themeAccountThemes: 'nd-account-themes',

  // Per-feature
  keybinds: 'nd-keybinds',
  plugins: 'nd-plugins',
  recentEmojis: 'nd-recent-emojis',
  emojisCache: 'emojis_cache',
  performance: 'nd-performance',
  mutedAds: 'nd-muted-ads',
  offlineMode: 'nd-offline-mode',
  realtimeMode: 'nd-realtime-mode',

  // Per-account (dynamic key builders)
  drafts: (accountId: string) => `nd-drafts-${accountId}`,
  notificationCache: (accountId: string) =>
    `nd-cache-notifications-${accountId}`,

  // AiScript plugin storage prefix
  aiscriptPlugin: (installId: string) => `nd-aiscript-plugin:${installId}:`,
  aiscriptStorage: (storagePrefix: string) => `nd-aiscript-${storagePrefix}:`,
} as const
