import { defineStore } from 'pinia'
import { ref } from 'vue'

const WALLPAPER_KEY = 'nd-deck-wallpaper'

export const useDeckWallpaperStore = defineStore('deckWallpaper', () => {
  const wallpaper = ref<string | null>(null)

  function setWallpaper(url: string) {
    wallpaper.value = url
    localStorage.setItem(WALLPAPER_KEY, url)
  }

  function clearWallpaper() {
    wallpaper.value = null
    localStorage.removeItem(WALLPAPER_KEY)
  }

  function loadWallpaper() {
    wallpaper.value = localStorage.getItem(WALLPAPER_KEY)
  }

  return {
    wallpaper,
    setWallpaper,
    clearWallpaper,
    loadWallpaper,
  }
})
