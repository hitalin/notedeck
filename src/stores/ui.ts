import { platform } from '@tauri-apps/plugin-os'
import { defineStore } from 'pinia'
import { ref } from 'vue'

const isTauri = '__TAURI_INTERNALS__' in window

const platformName = isTauri ? platform() : null
const isMobile = platformName === 'android' || platformName === 'ios'
const isDesktop = isTauri && !isMobile

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
