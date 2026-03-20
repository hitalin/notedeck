import { onUnmounted } from 'vue'
import { initAdapterFor } from '@/adapters/initAdapter'
import type { ServerAdapter } from '@/adapters/types'
import { useAccountsStore } from '@/stores/accounts'
import { useStreamingStore } from '@/stores/streaming'

/**
 * Lazily creates and caches per-account adapters for cross-account features.
 * Automatically cleans up streams on unmount.
 */
export function useMultiAccountAdapters() {
  const accountsStore = useAccountsStore()
  const streamingStore = useStreamingStore()

  const adapters = new Map<string, ServerAdapter>()
  const pending = new Map<string, Promise<ServerAdapter | null>>()

  async function getOrCreate(accountId: string): Promise<ServerAdapter | null> {
    const cached = adapters.get(accountId)
    if (cached) return cached
    const inflight = pending.get(accountId)
    if (inflight) return inflight

    const promise = (async () => {
      const acc = accountsStore.accounts.find((a) => a.id === accountId)
      if (!acc) return null
      const { adapter } = await initAdapterFor(acc.host, acc.id)
      adapters.set(accountId, adapter)

      // Bridge adapter stream events → streaming store for navbar indicator
      streamingStore.startListening()
      adapter.stream.on('connected', () => streamingStore.setConnected(acc.id))
      adapter.stream.on('disconnected', () => streamingStore.disconnect(acc.id))

      return adapter
    })()

    pending.set(accountId, promise)
    try {
      return await promise
    } finally {
      pending.delete(accountId)
    }
  }

  function cleanup() {
    for (const adapter of adapters.values()) {
      adapter.stream.disconnect()
    }
    adapters.clear()
    pending.clear()
  }

  onUnmounted(cleanup)

  return { getOrCreate, cleanup }
}
