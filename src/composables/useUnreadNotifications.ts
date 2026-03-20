import { invoke } from '@tauri-apps/api/core'
import { listen, type UnlistenFn } from '@tauri-apps/api/event'
import { computed, onUnmounted, ref, watch } from 'vue'
import { useAccountsStore } from '@/stores/accounts'

interface StreamEventEnvelope {
  kind: string
  payload: Record<string, unknown>
}

const counts = ref<Record<string, number>>({})

let listenerSetUp = false
let unlistenFn: UnlistenFn | null = null
let refCount = 0
let pollingInterval: ReturnType<typeof setInterval> | null = null
let isPollingActive = false

async function fetchUnreadCount(accountId: string): Promise<number> {
  try {
    return await invoke<number>('api_get_unread_notification_count', {
      accountId,
    })
  } catch {
    return 0
  }
}

async function setupListener() {
  if (listenerSetUp) return
  listenerSetUp = true
  unlistenFn = await listen<StreamEventEnvelope>('stream-event', (event) => {
    const { kind, payload } = event.payload
    const p = payload as Record<string, unknown>
    const accountId = p.accountId as string

    if (kind === 'stream-notification') {
      counts.value = {
        ...counts.value,
        [accountId]: (counts.value[accountId] ?? 0) + 1,
      }
    } else if (
      kind === 'stream-main-event' &&
      p.eventType === 'readAllNotifications'
    ) {
      counts.value = { ...counts.value, [accountId]: 0 }
    }
  })
}

function teardownListener() {
  if (unlistenFn) {
    unlistenFn()
    unlistenFn = null
  }
  listenerSetUp = false
}

export function useUnreadNotifications() {
  const accountsStore = useAccountsStore()

  const totalUnread = computed(() =>
    Object.values(counts.value).reduce((sum, c) => sum + c, 0),
  )

  async function fetchAll() {
    for (const acc of accountsStore.accounts) {
      const count = await fetchUnreadCount(acc.id)
      counts.value = { ...counts.value, [acc.id]: count }
    }
  }

  async function markAllAsRead() {
    for (const acc of accountsStore.accounts) {
      try {
        await invoke('api_mark_all_notifications_as_read', {
          accountId: acc.id,
        })
      } catch {
        // non-critical
      }
    }
    const reset: Record<string, number> = {}
    for (const acc of accountsStore.accounts) {
      reset[acc.id] = 0
    }
    counts.value = reset
  }

  function startPolling() {
    if (isPollingActive) return
    isPollingActive = true
    pollingInterval = setInterval(fetchAll, 60_000)
  }

  function stopPolling() {
    if (!isPollingActive) return
    isPollingActive = false
    if (pollingInterval) {
      clearInterval(pollingInterval)
      pollingInterval = null
    }
  }

  function onVisibilityChange() {
    if (document.hidden) {
      stopPolling()
    } else {
      fetchAll()
      startPolling()
    }
  }

  refCount++
  setupListener()

  // Re-fetch when accounts change
  watch(
    () => accountsStore.accounts.length,
    () => fetchAll(),
  )

  // Initial fetch + start polling only when visible
  fetchAll()
  if (!document.hidden) startPolling()
  document.addEventListener('visibilitychange', onVisibilityChange)

  onUnmounted(() => {
    stopPolling()
    document.removeEventListener('visibilitychange', onVisibilityChange)
    refCount--
    if (refCount <= 0) {
      teardownListener()
      refCount = 0
    }
  })

  return {
    totalUnread,
    counts,
    markAllAsRead,
    fetchAll,
  }
}
