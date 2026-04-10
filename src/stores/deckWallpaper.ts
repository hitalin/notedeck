import { defineStore } from 'pinia'
import { computed, watch } from 'vue'
import { useSettingsStore } from '@/stores/settings'
import { getStorageString, STORAGE_KEYS } from '@/utils/storage'

const LEGACY_STORAGE_KEY = STORAGE_KEYS.deckWallpaper

/**
 * Read the legacy localStorage wallpaper (base64 data URL) once, for
 * (a) fallback before settingsStore.load() completes and
 * (b) one-time migration into settings.json.
 */
function loadLegacyWallpaper(): string | null {
  return getStorageString(LEGACY_STORAGE_KEY)
}

export const useDeckWallpaperStore = defineStore('deckWallpaper', () => {
  const settingsStore = useSettingsStore()

  const legacyValue = loadLegacyWallpaper()

  // One-time migration: when settingsStore finishes loading, if settings.json
  // doesn't yet have `deck.wallpaper`, seed it from legacy localStorage
  // and clear the legacy key. Note: wallpapers can be several hundred KB as
  // base64 data URLs, so the debounced persist write pushes a sizeable payload
  // — acceptable since wallpaper is rarely changed.
  watch(
    () => settingsStore.initialized,
    (done) => {
      if (!done) return
      const current = settingsStore.get('deck.wallpaper')
      if (current === undefined && legacyValue != null) {
        settingsStore.set('deck.wallpaper', legacyValue)
        try {
          localStorage.removeItem(LEGACY_STORAGE_KEY)
        } catch {
          // ignore
        }
      }
    },
    { immediate: true },
  )

  /** Wallpaper base64 data URL, or null when no wallpaper is set. */
  const wallpaper = computed<string | null>({
    get: () => {
      const v = settingsStore.get('deck.wallpaper')
      if (v !== undefined) return v
      return legacyValue
    },
    set: (v) => {
      settingsStore.set('deck.wallpaper', v)
    },
  })

  function setWallpaper(url: string): void {
    wallpaper.value = url
  }

  function clearWallpaper(): void {
    wallpaper.value = null
  }

  /**
   * Kept for compatibility with existing callers (DeckLayout.vue). Loading is
   * now handled reactively via settingsStore.load(); this is a no-op.
   */
  function loadWallpaper(): void {
    // no-op — wallpaper is read reactively from settingsStore
  }

  return {
    wallpaper,
    setWallpaper,
    clearWallpaper,
    loadWallpaper,
  }
})
