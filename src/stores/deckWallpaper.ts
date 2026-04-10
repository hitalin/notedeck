import { defineStore } from 'pinia'
import { computed } from 'vue'
import { useSettingsStore } from '@/stores/settings'

export const useDeckWallpaperStore = defineStore('deckWallpaper', () => {
  const settingsStore = useSettingsStore()

  /** Wallpaper base64 data URL, or null when no wallpaper is set. */
  const wallpaper = computed<string | null>({
    get: () => settingsStore.get('deck.wallpaper') ?? null,
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

  return {
    wallpaper,
    setWallpaper,
    clearWallpaper,
  }
})
