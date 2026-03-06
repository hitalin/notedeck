import { onUnmounted } from 'vue'
import { createAdapter } from '@/adapters/registry'
import type { ServerAdapter } from '@/adapters/types'
import { useAccountsStore } from '@/stores/accounts'
import { useEmojisStore } from '@/stores/emojis'
import { usePinnedReactionsStore } from '@/stores/pinnedReactions'
import { useServersStore } from '@/stores/servers'

/**
 * Lazily creates and caches per-account adapters for cross-account features.
 * Automatically cleans up streams on unmount.
 */
export function useMultiAccountAdapters() {
  const accountsStore = useAccountsStore()
  const serversStore = useServersStore()
  const emojisStore = useEmojisStore()
  const pinnedReactionsStore = usePinnedReactionsStore()

  const adapters = new Map<string, ServerAdapter>()

  async function getOrCreate(accountId: string): Promise<ServerAdapter | null> {
    const cached = adapters.get(accountId)
    if (cached) return cached
    const acc = accountsStore.accounts.find((a) => a.id === accountId)
    if (!acc) return null
    const serverInfo = await serversStore.getServerInfo(acc.host)
    const adapter = createAdapter(serverInfo, acc.id)
    emojisStore.ensureLoaded(acc.host, () => adapter.api.getServerEmojis())
    pinnedReactionsStore.ensureLoaded(acc.id, () =>
      adapter.api.getPinnedReactions(),
    )
    adapters.set(accountId, adapter)
    return adapter
  }

  function cleanup() {
    for (const adapter of adapters.values()) {
      adapter.stream.cleanup()
    }
    adapters.clear()
  }

  onUnmounted(cleanup)

  return { getOrCreate, cleanup }
}
