import { useRouter } from 'vue-router'
import { useAccountsStore } from '@/stores/accounts'
import { useDeckStore } from '@/stores/deck'
import { useWindowsStore } from '@/stores/windows'

export function useNavigation() {
  const router = useRouter()
  const windowsStore = useWindowsStore()
  const accountsStore = useAccountsStore()
  const deckStore = useDeckStore()

  function isDeckActive(): boolean {
    return router.currentRoute.value.name === 'deck'
  }

  function navigateToNote(accountId: string, noteId: string) {
    if (isDeckActive()) {
      windowsStore.open('note-detail', { accountId, noteId })
    } else {
      router.push(`/note/${accountId}/${noteId}`)
    }
  }

  function navigateToUser(accountId: string, userId: string) {
    if (isDeckActive()) {
      windowsStore.open('user-profile', { accountId, userId })
    } else {
      router.push(`/user/${accountId}/${userId}`)
    }
  }

  function navigateToLogin(host?: string) {
    if (accountsStore.accounts.length === 0) {
      router.push(host ? { path: '/login', query: { host } } : '/login')
      return
    }
    if (isDeckActive()) {
      windowsStore.open('login', host ? { initialHost: host } : {})
    } else {
      router.push(host ? { path: '/login', query: { host } } : '/login')
    }
  }

  function toggleOrOpenWindow(
    type: 'notifications' | 'search' | 'chat' | 'ai',
  ) {
    if (isDeckActive()) {
      deckStore.toggleSidebarColumn(type, null)
    } else {
      windowsStore.open(type)
    }
  }

  function navigateToSearch() {
    toggleOrOpenWindow('search')
  }

  function navigateToNotifications() {
    toggleOrOpenWindow('notifications')
  }

  function navigateToPlugins() {
    windowsStore.open('plugins')
  }

  function navigateToAi() {
    toggleOrOpenWindow('ai')
  }

  function navigateToChat() {
    toggleOrOpenWindow('chat')
  }

  return {
    navigateToNote,
    navigateToUser,
    navigateToLogin,
    navigateToSearch,
    navigateToNotifications,
    navigateToPlugins,
    navigateToAi,
    navigateToChat,
  }
}
