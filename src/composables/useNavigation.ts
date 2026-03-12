import { useRouter } from 'vue-router'
import { useAccountsStore } from '@/stores/accounts'
import { useWindowsStore } from '@/stores/windows'

export function useNavigation() {
  const router = useRouter()
  const windowsStore = useWindowsStore()
  const accountsStore = useAccountsStore()

  function isDeckActive(): boolean {
    return window.innerWidth > 500
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

  function navigateToLogin() {
    if (accountsStore.accounts.length === 0) {
      router.push('/login')
      return
    }
    if (isDeckActive()) {
      windowsStore.open('login')
    } else {
      router.push('/login')
    }
  }

  function navigateToSearch() {
    windowsStore.open('search')
  }

  function navigateToNotifications() {
    windowsStore.open('notifications')
  }

  function navigateToPlugins() {
    windowsStore.open('plugins')
  }

  function navigateToAi() {
    windowsStore.open('ai')
  }

  function navigateToChat() {
    windowsStore.open('chat')
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
