import { defineStore } from 'pinia'
import { shallowRef } from 'vue'
import type { ServerEmoji } from '@/adapters/types'
import { getStorageJson, STORAGE_KEYS, setStorageJson } from '@/utils/storage'

export const useEmojisStore = defineStore('emojis', () => {
  // host → (shortcode → url) — for fast emoji resolution in notes
  // Cap entries per host to limit memory (large servers have 5000+ emoji)
  const MAX_CACHE_PER_HOST = 1500
  const cache = shallowRef(new Map<string, Record<string, string>>())

  // host → ServerEmoji[] — for the reaction picker (with category/aliases)
  // Only keep the most recent MAX_EMOJI_LIST_HOSTS hosts to bound memory
  const MAX_EMOJI_LIST_HOSTS = 3
  const emojiList = shallowRef(new Map<string, ServerEmoji[]>())

  // In-flight dedup: avoid parallel fetches for the same host
  const pending = new Map<string, Promise<void>>()
  // Backoff: track failed hosts to avoid immediate retry
  const failedHosts = new Map<string, number>()

  // Load shortcode→url cache from localStorage (for offline emoji resolution)
  function loadFromStorage() {
    const obj = getStorageJson<Record<string, Record<string, string>> | null>(
      STORAGE_KEYS.emojisCache,
      null,
    )
    if (!obj) return
    const map = new Map<string, Record<string, string>>()
    for (const [host, lookup] of Object.entries(obj)) {
      map.set(host, lookup)
    }
    cache.value = map
  }

  /** Max emoji entries to persist per host.
   *  Full lists are kept in memory; only a subset is persisted to localStorage
   *  to avoid quota issues with large servers (some have 5000+ custom emoji). */
  const MAX_PERSIST_PER_HOST = 200

  function persistToStorage() {
    try {
      const obj: Record<string, Record<string, string>> = {}
      for (const [host, lookup] of cache.value) {
        const keys = Object.keys(lookup)
        if (keys.length <= MAX_PERSIST_PER_HOST) {
          obj[host] = lookup
        } else {
          // Persist only the first N entries (most commonly used come first from API)
          const subset: Record<string, string> = {}
          for (const key of keys.slice(0, MAX_PERSIST_PER_HOST)) {
            subset[key] = lookup[key] ?? ''
          }
          obj[host] = subset
        }
      }
      setStorageJson(STORAGE_KEYS.emojisCache, obj)
    } catch {
      // storage full, ignore
    }
  }

  // Initialize from localStorage
  loadFromStorage()

  function set(host: string, emojis: ServerEmoji[]) {
    // Build shortcode→url lookup for resolution (cap per host)
    const lookup: Record<string, string> = {}
    const capped =
      emojis.length > MAX_CACHE_PER_HOST
        ? emojis.slice(0, MAX_CACHE_PER_HOST)
        : emojis
    for (const e of capped) {
      lookup[e.name] = e.url
    }

    const nextCache = new Map(cache.value)
    nextCache.set(host, lookup)
    cache.value = nextCache

    // emojiList: only keep the most recent hosts to bound memory
    const nextList = new Map(emojiList.value)
    nextList.set(host, emojis)
    if (nextList.size > MAX_EMOJI_LIST_HOSTS) {
      const oldest = nextList.keys().next().value
      if (oldest !== undefined) nextList.delete(oldest)
    }
    emojiList.value = nextList

    pending.delete(host)

    // Persist shortcode→url cache for offline use
    persistToStorage()
  }

  const RETRY_BACKOFF_MS = 30_000

  function ensureLoaded(
    host: string,
    fetcher: () => Promise<ServerEmoji[]>,
  ): void {
    if (
      (cache.value.has(host) && emojiList.value.has(host)) ||
      pending.has(host)
    )
      return
    const failedAt = failedHosts.get(host)
    if (failedAt && Date.now() - failedAt < RETRY_BACKOFF_MS) return
    const p = fetcher()
      .then((emojis) => {
        failedHosts.delete(host)
        set(host, emojis)
      })
      .catch((e) => {
        console.warn('[emojis] failed to fetch:', host, e)
        failedHosts.set(host, Date.now())
        pending.delete(host)
      })
    pending.set(host, p)
  }

  function resolve(host: string, shortcode: string): string | null {
    const map = cache.value.get(host)
    if (!map) return null
    const base = shortcode.replace(/@\.$/, '')
    return map[shortcode] || map[base] || map[`${base}@.`] || null
  }

  function getEmojiList(host: string): ServerEmoji[] {
    return emojiList.value.get(host) ?? []
  }

  function has(host: string): boolean {
    return cache.value.has(host)
  }

  return { cache, emojiList, set, ensureLoaded, resolve, getEmojiList, has }
})
