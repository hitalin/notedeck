import type { Ref } from 'vue'
import { onMounted, onUnmounted } from 'vue'
import { loadCliCommands } from '@/commands/cliParser'
import {
  registerDefaultCommands,
  unregisterDefaultCommands,
} from '@/commands/definitions'
import { useCommandStore } from '@/commands/registry'
import {
  listenDeckWindowEvents,
  saveCurrentWindowLayout,
} from '@/composables/useDeckWindow'
import { initOgpListener } from '@/composables/useOgpPreview'
import { useDeckStore } from '@/stores/deck'
import { useOfflineModeStore } from '@/stores/offlineMode'
import { usePluginsStore } from '@/stores/plugins'
import { useRealtimeModeStore } from '@/stores/realtimeMode'
import { useUiStore } from '@/stores/ui'
import { destroyApiBridge, initApiBridge } from '@/utils/apiBridge'
import {
  initDesktopNotifications,
  onNotificationAction,
} from '@/utils/desktopNotification'

export function useDeckInit(options: {
  openCompose: () => void
  navigateToSearch: () => void
  navigateToNotifications: () => void
  navigateToNote: (accountId: string, noteId: string) => void
  navigateToUser: (accountId: string, userId: string) => void
  toggleAddMenu: () => void
  navbarRef: Ref<{
    toggleNav(): void
    toggleFirstAccountMenu(): void
    handleResize(): void
  } | null>
  checkForUpdate: () => void
}) {
  const deckStore = useDeckStore()
  const pluginsStore = usePluginsStore()
  const commandStore = useCommandStore()
  const uiStore = useUiStore()

  let handleResizeRef: (() => void) | null = null
  let unlistenQuickNote: (() => void) | null = null
  let unlistenWindowEvents: (() => void) | null = null

  function onVisibilityChange() {
    if (document.hidden) {
      deckStore.flushSave()
    } else {
      window.dispatchEvent(new CustomEvent('deck-resume'))
    }
  }

  function onPageHide() {
    deckStore.flushSave()
  }

  let updateCheckTimer: ReturnType<typeof setTimeout> | undefined

  onMounted(() => {
    // Signal that deck layout structure is in the DOM — splash can dismiss now.
    // Data (notes) loads asynchronously; column frames are already visible.
    window.dispatchEvent(new Event('nd:deck-mounted'))

    handleResizeRef = () => options.navbarRef.value?.handleResize()
    window.addEventListener('resize', handleResizeRef)
    document.addEventListener('visibilitychange', onVisibilityChange)
    window.addEventListener('pagehide', onPageHide)

    // Critical: start streaming immediately
    deckStore.startSync()

    // Register commands synchronously (needed for keyboard shortcuts)
    registerDefaultCommands({
      openCompose: options.openCompose,
      openSearch: options.navigateToSearch,
      openNotifications: options.navigateToNotifications,
      toggleAddMenu: options.toggleAddMenu,
      toggleNav: () => options.navbarRef.value?.toggleNav(),
      toggleAccountMenu: () =>
        options.navbarRef.value?.toggleFirstAccountMenu(),
    })

    // Defer non-critical initialization to after first paint
    requestAnimationFrame(() => {
      initApiBridge()
      initDesktopNotifications()
      initOgpListener()
      loadCliCommands()
      onNotificationAction((ctx) => {
        if (ctx.noteId) {
          options.navigateToNote(ctx.accountId, ctx.noteId)
        } else if (ctx.userId) {
          options.navigateToUser(ctx.accountId, ctx.userId)
        }
      })
    })

    updateCheckTimer = setTimeout(options.checkForUpdate, 5000)

    // Plugins — defer to idle since AiScript is not on the critical startup path
    const idle =
      window.requestIdleCallback ??
      ((cb: IdleRequestCallback) => setTimeout(cb, 500))
    idle(() => {
      import('@/aiscript/plugin-api').then(({ launchAllPlugins }) => {
        pluginsStore.ensureLoaded()
        launchAllPlugins(pluginsStore.plugins)
      })
    })

    // Quick Note: global hotkey (Ctrl+Alt+N)
    if (uiStore.isDesktop) {
      import('@tauri-apps/api/event').then(({ listen }) => {
        listen('nd:quick-note', () => {
          commandStore.openWithInput('post ')
        }).then((fn) => {
          unlistenQuickNote = fn
        })
        listen('nd:toggle-offline-mode', () => {
          useOfflineModeStore().toggle()
        })
        listen('nd:toggle-realtime-mode', () => {
          useRealtimeModeStore().toggle()
        })
      })

      // Cross-window event listeners (all windows listen for IPC events)
      listenDeckWindowEvents().then((fn) => {
        unlistenWindowEvents = fn
      })

      // Sub-windows save their layout on beforeunload
      if (deckStore.currentWindowId) {
        window.addEventListener('beforeunload', () => {
          saveCurrentWindowLayout()
        })
      }
    }
  })

  onUnmounted(() => {
    import('@/aiscript/plugin-api').then(({ abortAllPlugins }) => {
      abortAllPlugins()
    })
    deckStore.stopSync()
    destroyApiBridge()
    unregisterDefaultCommands()
    if (handleResizeRef) window.removeEventListener('resize', handleResizeRef)
    document.removeEventListener('visibilitychange', onVisibilityChange)
    window.removeEventListener('pagehide', onPageHide)
    unlistenQuickNote?.()
    clearTimeout(updateCheckTimer)
    unlistenWindowEvents?.()
  })
}
