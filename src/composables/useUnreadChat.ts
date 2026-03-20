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

async function fetchUnreadCount(accountId: string): Promise<number> {
  try {
    const result = await invoke<boolean>('api_get_unread_chat', {
      accountId,
    })
    return result ? 1 : 0
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

    if (kind === 'stream-chat-message') {
      counts.value = {
        ...counts.value,
        [accountId]: (counts.value[accountId] ?? 0) + 1,
      }
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

export function useUnreadChat() {
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

  function resetAll() {
    const reset: Record<string, number> = {}
    for (const acc of accountsStore.accounts) {
      reset[acc.id] = 0
    }
    counts.value = reset
  }

  const interval = setInterval(fetchAll, 60_000)

  refCount++
  setupListener()

  watch(
    () => accountsStore.accounts.length,
    () => fetchAll(),
  )

  fetchAll()

  onUnmounted(() => {
    clearInterval(interval)
    refCount--
    if (refCount <= 0) {
      teardownListener()
      refCount = 0
    }
  })

  return {
    totalUnread,
    counts,
    resetAll,
    fetchAll,
  }
}
