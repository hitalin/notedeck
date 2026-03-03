import { defineStore } from 'pinia'
import { shallowRef } from 'vue'

const DEFAULT_REACTIONS = ['👍', '❤️', '😆', '🤔', '😮', '🎉', '💢', '😥', '😇', '🍮']

export const usePinnedReactionsStore = defineStore('pinnedReactions', () => {
  // accountId → pinned reaction list
  const cache = shallowRef(new Map<string, string[]>())
  const pending = new Map<string, Promise<void>>()

  function set(accountId: string, reactions: string[]) {
    const next = new Map(cache.value)
    next.set(accountId, reactions.length > 0 ? reactions : DEFAULT_REACTIONS)
    cache.value = next
    pending.delete(accountId)
  }

  function ensureLoaded(
    accountId: string,
    fetcher: () => Promise<string[]>,
  ): void {
    if (cache.value.has(accountId) || pending.has(accountId)) return
    const p = fetcher()
      .then((reactions) => set(accountId, reactions))
      .catch((e) => {
        console.warn('[pinnedReactions] failed to fetch:', accountId, e)
        set(accountId, DEFAULT_REACTIONS)
      })
    pending.set(accountId, p)
  }

  function get(accountId: string): string[] {
    return cache.value.get(accountId) ?? DEFAULT_REACTIONS
  }

  return { cache, set, ensureLoaded, get }
})
