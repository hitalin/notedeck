import { useEmojisStore } from '@/stores/emojis'
import { usePinnedReactionsStore } from '@/stores/pinnedReactions'
import { useServersStore } from '@/stores/servers'
import { createAdapter } from './registry'
import type { ServerAdapter, ServerInfo } from './types'

export interface InitAdapterResult {
  adapter: ServerAdapter
  serverInfo: ServerInfo
}

/**
 * Common adapter initialization: fetch server info, create adapter, and
 * ensure emoji / pinned-reaction caches are populated.
 *
 * @param host        Server hostname
 * @param accountId   Account ID for the adapter
 * @param options.pinnedReactions  Also load pinned reactions (default: true)
 */
export async function initAdapterFor(
  host: string,
  accountId: string,
  options?: { pinnedReactions?: boolean },
): Promise<InitAdapterResult> {
  const serversStore = useServersStore()
  const emojisStore = useEmojisStore()

  const serverInfo = await serversStore.getServerInfo(host)
  const adapter = createAdapter(serverInfo, accountId)

  emojisStore.ensureLoaded(host, () => adapter.api.getServerEmojis())

  if (options?.pinnedReactions !== false) {
    const pinnedReactionsStore = usePinnedReactionsStore()
    pinnedReactionsStore.ensureLoaded(accountId, () =>
      adapter.api.getPinnedReactions(),
    )
  }

  return { adapter, serverInfo }
}
