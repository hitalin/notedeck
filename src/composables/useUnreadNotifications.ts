import { useUnreadCounter } from '@/composables/useUnreadCounter'
import { useAccountsStore } from '@/stores/accounts'
import { commands, unwrap } from '@/utils/tauriInvoke'

async function fetchUnreadCount(accountId: string): Promise<number> {
  try {
    return unwrap(await commands.apiGetUnreadNotificationCount(accountId))
  } catch {
    return 0
  }
}

export function useUnreadNotifications() {
  const { totalUnread, counts, fetchAll, resetAll } = useUnreadCounter(
    'notifications',
    {
      pollIntervalKey: 'notificationPollInterval',
      fetchCount: fetchUnreadCount,
      onStreamEvent: (kind, payload, current) => {
        if (kind === 'stream-notification') return current + 1
        if (
          kind === 'stream-main-event' &&
          payload.eventType === 'readAllNotifications'
        )
          return 0
        return null
      },
    },
  )

  async function markAllAsRead() {
    const accountsStore = useAccountsStore()
    for (const acc of accountsStore.accounts) {
      if (!acc.hasToken) continue
      try {
        unwrap(await commands.apiMarkAllNotificationsAsRead(acc.id))
      } catch {
        // non-critical
      }
    }
    resetAll()
  }

  return { totalUnread, counts, markAllAsRead, fetchAll }
}
