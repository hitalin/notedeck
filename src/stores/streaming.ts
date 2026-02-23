import { defineStore } from 'pinia'
import { ref } from 'vue'
import type {
  ChannelSubscription,
  ServerAdapter,
  StreamConnectionState,
  TimelineType,
} from '@/adapters/types'

interface ConnectionEntry {
  accountId: string
  adapter: ServerAdapter
  state: StreamConnectionState
  subscriptions: ChannelSubscription[]
}

export const useStreamingStore = defineStore('streaming', () => {
  const connections = ref(new Map<string, ConnectionEntry>())

  function connect(accountId: string, adapter: ServerAdapter): void {
    if (connections.value.has(accountId)) return

    const entry: ConnectionEntry = {
      accountId,
      adapter,
      state: 'initializing',
      subscriptions: [],
    }

    adapter.stream.on('connected', () => {
      entry.state = 'connected'
    })
    adapter.stream.on('disconnected', () => {
      entry.state = 'disconnected'
    })
    adapter.stream.on('reconnecting', () => {
      entry.state = 'reconnecting'
    })

    adapter.stream.connect()
    connections.value.set(accountId, entry)
  }

  function disconnect(accountId: string): void {
    const entry = connections.value.get(accountId)
    if (!entry) return

    for (const sub of entry.subscriptions) {
      sub.dispose()
    }
    entry.adapter.stream.disconnect()
    connections.value.delete(accountId)
  }

  function disconnectAll(): void {
    for (const accountId of connections.value.keys()) {
      disconnect(accountId)
    }
  }

  function subscribe(
    accountId: string,
    type: TimelineType,
    onNote: Parameters<ServerAdapter['stream']['subscribeTimeline']>[1],
  ): ChannelSubscription | null {
    const entry = connections.value.get(accountId)
    if (!entry) return null

    const sub = entry.adapter.stream.subscribeTimeline(type, onNote)
    entry.subscriptions.push(sub)
    return sub
  }

  function getState(accountId: string): StreamConnectionState | null {
    return connections.value.get(accountId)?.state ?? null
  }

  return {
    connections,
    connect,
    disconnect,
    disconnectAll,
    subscribe,
    getState,
  }
})
