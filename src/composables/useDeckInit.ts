import type { Ref } from 'vue'
import { onMounted, onUnmounted } from 'vue'
import { loadCliCommands } from '@/commands/cliParser'
import {
  registerDefaultCommands,
  unregisterDefaultCommands,
} from '@/commands/definitions'
import { useCommandStore } from '@/commands/registry'
import { useDeckStore } from '@/stores/deck'
import { usePluginsStore } from '@/stores/plugins'
import { useUiStore } from '@/stores/ui'
import { destroyApiBridge, initApiBridge } from '@/utils/apiBridge'
import {
  listenDeckWindowEvents,
  saveCurrentWindowLayout,
} from '@/composables/useDeckWindow'
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
    if (!document.hidden) {
      window.dispatchEvent(new CustomEvent('deck-resume'))
    }
  }

  onMounted(() => {
    handleResizeRef = () => options.navbarRef.value?.handleResize()
    window.addEventListener('resize', handleResizeRef)
    document.addEventListener('visibilitychange', onVisibilityChange)

    deckStore.startSync()
    initApiBridge()
    initDesktopNotifications()
    loadCliCommands()
    registerDefaultCommands({
      openCompose: options.openCompose,
      openSearch: options.navigateToSearch,
      openNotifications: options.navigateToNotifications,
      toggleAddMenu: options.toggleAddMenu,
      toggleNav: () => options.navbarRef.value?.toggleNav(),
      toggleAccountMenu: () =>
        options.navbarRef.value?.toggleFirstAccountMenu(),
    })
    onNotificationAction((ctx) => {
      if (ctx.noteId) {
        options.navigateToNote(ctx.accountId, ctx.noteId)
      } else if (ctx.userId) {
        options.navigateToUser(ctx.accountId, ctx.userId)
      }
    })

    setTimeout(options.checkForUpdate, 5000)

    // Plugins
    import('@/aiscript/plugin-api').then(({ launchAllPlugins }) => {
      pluginsStore.ensureLoaded()
      launchAllPlugins(pluginsStore.plugins)
    })

    // Quick Note: global hotkey (Ctrl+Alt+N)
    if (uiStore.isDesktop) {
      import('@tauri-apps/api/event').then(({ listen }) => {
        listen('nd:quick-note', () => {
          commandStore.openWithInput('post ')
        }).then((fn) => {
          unlistenQuickNote = fn
        })
      })

      // Cross-window event listeners (main window listens for sub-window events)
      if (!deckStore.currentWindowId) {
        listenDeckWindowEvents().then((fn) => {
          unlistenWindowEvents = fn
        })
      }

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
    unlistenQuickNote?.()
    unlistenWindowEvents?.()
  })
}
