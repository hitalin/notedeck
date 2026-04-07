import { useUnreadCounter } from '@/composables/useUnreadCounter'
import { commands, unwrap } from '@/utils/tauriInvoke'

async function fetchUnreadCount(accountId: string): Promise<number> {
  try {
    const result = unwrap(await commands.apiGetUnreadChat(accountId))
    return result ? 1 : 0
  } catch {
    return 0
  }
}

export function useUnreadChat() {
  const { totalUnread, counts, fetchAll, resetAll } = useUnreadCounter('chat', {
    pollIntervalKey: 'chatPollInterval',
    fetchCount: fetchUnreadCount,
    onStreamEvent: (kind, _payload, current) => {
      if (kind === 'stream-chat-message') return current + 1
      return null
    },
  })

  return { totalUnread, counts, fetchAll, resetAll }
}
