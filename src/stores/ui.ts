import { type Platform, platform } from '@tauri-apps/plugin-os'
import { defineStore, storeToRefs } from 'pinia'
import { computed, ref } from 'vue'

const isTauri = '__TAURI_INTERNALS__' in window || '__TAURI__' in window

export function detectPlatformFromUserAgent(
  userAgent: string,
): Platform | null {
  if (/android/i.test(userAgent)) return 'android'
  if (/(iphone|ipad|ipod)/i.test(userAgent)) return 'ios'
  if (/windows/i.test(userAgent)) return 'windows'
  if (/(macintosh|mac os x)/i.test(userAgent)) return 'macos'
  if (/linux/i.test(userAgent)) return 'linux'
  return null
}

function resolvePlatformName(): Platform | null {
  if (isTauri) {
    try {
      return platform()
    } catch {
      // Fallback to user agent if Tauri os plugin internals are unavailable.
    }
  }
  return detectPlatformFromUserAgent(navigator.userAgent)
}

const platformName = resolvePlatformName()
const isMobilePlatform = platformName === 'android' || platformName === 'ios'
const isDesktop = isTauri && !isMobilePlatform

const MOBILE_BREAKPOINT = 500

export const useUiStore = defineStore('ui', () => {
  const sidebarOpen = ref(true)

  const isNarrowViewport = ref(window.innerWidth <= MOBILE_BREAKPOINT)
  window.addEventListener('resize', () => {
    isNarrowViewport.value = window.innerWidth <= MOBILE_BREAKPOINT
  })

  /** ビューポート幅ベースのレイアウト判定（タブレット横持ち等では false） */
  const isCompactLayout = computed(() => isNarrowViewport.value)

  function toggleSidebar(): void {
    sidebarOpen.value = !sidebarOpen.value
  }

  return {
    isTauri,
    isDesktop,
    isCompactLayout,
    isMobilePlatform,
    platformName,
    sidebarOpen,
    toggleSidebar,
  }
})

/** isCompactLayout を reactive に取得するヘルパー */
export function useIsCompactLayout() {
  const { isCompactLayout } = storeToRefs(useUiStore())
  return isCompactLayout
}
