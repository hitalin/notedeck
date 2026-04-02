import { onUnmounted } from 'vue'
import { initAdapterFor } from '@/adapters/initAdapter'
import type { ServerAdapter } from '@/adapters/types'
import { useAccountsStore } from '@/stores/accounts'

/**
 * Lazily creates and caches per-account adapters for cross-account features.
 * Automatically cleans up streams on unmount.
 */
export function useMultiAccountAdapters() {
  const accountsStore = useAccountsStore()

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
      // Use cleanup() instead of disconnect() to avoid closing the shared
      // Rust-side WebSocket — other columns may still use the same connection.
      adapter.stream.cleanup()
    }
    adapters.clear()
    pending.clear()
  }

  onUnmounted(cleanup)

  return { getOrCreate, cleanup }
}
