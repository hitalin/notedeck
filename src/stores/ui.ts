import { platform } from '@tauri-apps/plugin-os'
import { defineStore, storeToRefs } from 'pinia'
import { computed, ref } from 'vue'

const isTauri = '__TAURI_INTERNALS__' in window

const platformName = isTauri ? platform() : null
const isMobilePlatform = platformName === 'android' || platformName === 'ios'
const isDesktop = isTauri && !isMobilePlatform

const MOBILE_BREAKPOINT = 500

export const useUiStore = defineStore('ui', () => {
  const sidebarOpen = ref(true)

  const isNarrowViewport = ref(window.innerWidth <= MOBILE_BREAKPOINT)
  window.addEventListener('resize', () => {
    isNarrowViewport.value = window.innerWidth <= MOBILE_BREAKPOINT
  })

  const isMobile = computed(() => isMobilePlatform || isNarrowViewport.value)

  function toggleSidebar(): void {
    sidebarOpen.value = !sidebarOpen.value
  }

  return {
    isTauri,
    isDesktop,
    isMobile,
    isMobilePlatform,
    platformName,
    sidebarOpen,
    toggleSidebar,
  }
})

/** isMobile を reactive に取得するヘルパー */
export function useIsMobile() {
  const { isMobile } = storeToRefs(useUiStore())
  return isMobile
}
