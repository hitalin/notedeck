import { createAdapter } from '@/adapters/registry'
import type { ServerAdapter, ServerInfo } from '@/adapters/types'
import { useEmojisStore } from '@/stores/emojis'
import { usePinnedReactionsStore } from '@/stores/pinnedReactions'
import { useServersStore } from '@/stores/servers'

export interface InitAdapterResult {
  adapter: ServerAdapter
  serverInfo: ServerInfo
}

// Global adapter cache: accountId -> ServerAdapter
const adapterCache = new Map<string, ServerAdapter>()
const adapterPending = new Map<string, Promise<InitAdapterResult>>()

/**
 * Common adapter initialization with accountId-based caching.
 *
 * The same accountId always returns the same adapter instance.
 * This eliminates duplicate MisskeyApi / MisskeyStream instances
 * when multiple columns share the same account.
 */
export async function initAdapterFor(
  host: string,
  accountId: string,
  options?: { pinnedReactions?: boolean; hasToken?: boolean },
): Promise<InitAdapterResult> {
  const hasToken = options?.hasToken !== false

  // Return cached adapter if available
  const cached = adapterCache.get(accountId)
  if (cached) {
    const serverInfo = cached.serverInfo
    ensureSideEffects(host, accountId, cached, hasToken, options)
    return { adapter: cached, serverInfo }
  }

  // In-flight dedup: if another caller is already initializing this accountId, wait for it
  const inflight = adapterPending.get(accountId)
  if (inflight) return inflight

  const promise = (async (): Promise<InitAdapterResult> => {
    const serversStore = useServersStore()
    const serverInfo = await serversStore.getServerInfo(host)
    const adapter = createAdapter(serverInfo, accountId, hasToken)

    adapterCache.set(accountId, adapter)
    ensureSideEffects(host, accountId, adapter, hasToken, options)

    return { adapter, serverInfo }
  })()

  adapterPending.set(accountId, promise)
  try {
    return await promise
  } finally {
    adapterPending.delete(accountId)
  }
}

/** Kick off emoji / pinned-reaction loading (idempotent) */
function ensureSideEffects(
  host: string,
  accountId: string,
  adapter: ServerAdapter,
  hasToken: boolean,
  options?: { pinnedReactions?: boolean },
): void {
  const emojisStore = useEmojisStore()
  emojisStore.ensureLoaded(host, () => adapter.api.getServerEmojis())

  if (hasToken && options?.pinnedReactions !== false) {
    const pinnedReactionsStore = usePinnedReactionsStore()
    pinnedReactionsStore.ensureLoaded(accountId, () =>
      adapter.api.getPinnedReactions(),
    )
  }
}

/**
 * Destroy the cached adapter for an account.
 * Call on logout or account removal.
 */
export function destroyAdapter(accountId: string): void {
  const adapter = adapterCache.get(accountId)
  if (!adapter) return
  adapter.stream.cleanup()
  adapterCache.delete(accountId)
}

/**
 * Destroy all cached adapters.
 * Call on app shutdown or full reset.
 */
export function destroyAllAdapters(): void {
  for (const adapter of adapterCache.values()) {
    adapter.stream.cleanup()
  }
  adapterCache.clear()
  adapterPending.clear()
}

/** Check if an adapter is cached for the given accountId (for testing/debug) */
export function hasAdapterCache(accountId: string): boolean {
  return adapterCache.has(accountId)
}
