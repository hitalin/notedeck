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

export function useTimeline(account: Account) {
  const timelinesStore = useTimelinesStore()
  const streamingStore = useStreamingStore()
  const serversStore = useServersStore()

  const isConnected = ref(false)
  let adapter: ServerAdapter | null = null
  let subscription: ChannelSubscription | null = null

  async function connect(type: TimelineType = 'home') {
    const serverInfo = await serversStore.getServerInfo(account.host)
    adapter = createAdapter(serverInfo, account.id)

    timelinesStore.initTimeline(account.id, type)
    timelinesStore.setLoading(account.id, true)

    const notes = await adapter.api.getTimeline(type)
    timelinesStore.setNotes(account.id, notes)
    timelinesStore.setLoading(account.id, false)

    streamingStore.connect(account.id, adapter)
    subscription = streamingStore.subscribe(
      account.id,
      type,
      (note: NormalizedNote) => {
        timelinesStore.pushNote(account.id, note)
      },
    )

    isConnected.value = true
  }

  async function loadMore() {
    if (!adapter) return
    const tl = timelinesStore.perServer.get(account.id)
    if (!tl || tl.isLoading || tl.notes.length === 0) return

    const lastNote = tl.notes[tl.notes.length - 1]!
    timelinesStore.setLoading(account.id, true)
    const older = await adapter.api.getTimeline(tl.type, {
      untilId: lastNote.id,
    })
    timelinesStore.appendNotes(account.id, older)
    timelinesStore.setLoading(account.id, false)
  }

  function disconnect() {
    subscription?.dispose()
    streamingStore.disconnect(account.id)
    timelinesStore.clear(account.id)
    isConnected.value = false
    adapter = null
  }

  onUnmounted(() => {
    disconnect()
  })

  return {
    isConnected,
    connect,
    loadMore,
    disconnect,
  }
}
