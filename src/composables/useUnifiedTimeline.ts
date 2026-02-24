import { onUnmounted, ref } from 'vue'
import { createAdapter } from '@/adapters/registry'
import type {
  ChannelSubscription,
  NormalizedNote,
  ServerAdapter,
  TimelineType,
} from '@/adapters/types'
import type { Account } from '@/stores/accounts'
import { useServersStore } from '@/stores/servers'
import { useStreamingStore } from '@/stores/streaming'
import { useTimelinesStore } from '@/stores/timelines'

interface AccountConnection {
  account: Account
  adapter: ServerAdapter
  subscription: ChannelSubscription | null
}

export function useUnifiedTimeline(accounts: Account[]) {
  const timelinesStore = useTimelinesStore()
  const streamingStore = useStreamingStore()
  const serversStore = useServersStore()

  const isConnecting = ref(false)
  const errors = ref<Map<string, string>>(new Map())
  const activeConnections = ref<AccountConnection[]>([])

  async function connectAll(type: TimelineType = 'home') {
    isConnecting.value = true
    errors.value.clear()

    const results = await Promise.allSettled(
      accounts.map((account) => connectAccount(account, type)),
    )

    for (let i = 0; i < results.length; i++) {
      const result = results[i]!
      if (result.status === 'rejected') {
        errors.value.set(
          accounts[i]!.id,
          result.reason instanceof Error
            ? result.reason.message
            : 'Connection failed',
        )
      }
    }

    isConnecting.value = false
  }

  async function connectAccount(account: Account, type: TimelineType) {
    const serverInfo = await serversStore.getServerInfo(account.host)
    const adapter = createAdapter(serverInfo, account.token, account.id)

    timelinesStore.initTimeline(account.id, type)
    timelinesStore.setLoading(account.id, true)

    const notes = await adapter.api.getTimeline(type)
    timelinesStore.setNotes(account.id, notes)
    timelinesStore.setLoading(account.id, false)

    streamingStore.connect(account.id, adapter)
    const subscription = streamingStore.subscribe(
      account.id,
      type,
      (note: NormalizedNote) => {
        timelinesStore.pushNote(account.id, note)
      },
    )

    activeConnections.value.push({ account, adapter, subscription })
  }

  function disconnectAll() {
    for (const conn of activeConnections.value) {
      conn.subscription?.dispose()
      streamingStore.disconnect(conn.account.id)
      timelinesStore.clear(conn.account.id)
    }
    activeConnections.value = []
  }

  onUnmounted(() => {
    disconnectAll()
  })

  return {
    isConnecting,
    errors,
    unified: timelinesStore.unified,
    connectAll,
    disconnectAll,
  }
}
