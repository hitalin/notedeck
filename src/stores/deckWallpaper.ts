import { defineStore } from 'pinia'
import { ref } from 'vue'
import {
  getStorageString,
  STORAGE_KEYS,
  setStorageString,
} from '@/utils/storage'

export const useDeckWallpaperStore = defineStore('deckWallpaper', () => {
  const wallpaper = ref<string | null>(null)

  function setWallpaper(url: string) {
    wallpaper.value = url
    setStorageString(STORAGE_KEYS.deckWallpaper, url)
  }

  function clearWallpaper() {
    wallpaper.value = null
    setStorageString(STORAGE_KEYS.deckWallpaper, null)
  }

  function loadWallpaper() {
    wallpaper.value = getStorageString(STORAGE_KEYS.deckWallpaper)
  }

  return {
    wallpaper,
    setWallpaper,
    clearWallpaper,
    loadWallpaper,
  }
})
