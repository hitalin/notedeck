import { defineStore } from 'pinia'
import { ref } from 'vue'

const isTauri = '__TAURI_INTERNALS__' in window

const isDesktop =
  isTauri && matchMedia('(hover: hover) and (pointer: fine)').matches

const isMobile = isTauri && !isDesktop

export const useUiStore = defineStore('ui', () => {
  const sidebarOpen = ref(true)

  function toggleSidebar(): void {
    sidebarOpen.value = !sidebarOpen.value
  }

  return {
    isTauri,
    isDesktop,
    isMobile,
    sidebarOpen,
    toggleSidebar,
  }
})
