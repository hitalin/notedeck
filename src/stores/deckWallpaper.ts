import { defineStore } from 'pinia'
import { ref } from 'vue'
import { getStorageString, setStorageString } from '@/utils/storage'

const WALLPAPER_KEY = 'nd-deck-wallpaper'

export const useDeckWallpaperStore = defineStore('deckWallpaper', () => {
  const wallpaper = ref<string | null>(null)

  function setWallpaper(url: string) {
    wallpaper.value = url
    setStorageString(WALLPAPER_KEY, url)
  }

  function clearWallpaper() {
    wallpaper.value = null
    setStorageString(WALLPAPER_KEY, null)
  }

  function loadWallpaper() {
    wallpaper.value = getStorageString(WALLPAPER_KEY)
  }

  return {
    wallpaper,
    setWallpaper,
    clearWallpaper,
    loadWallpaper,
  }
})
