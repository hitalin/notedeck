import { defineStore } from 'pinia'
import { shallowRef } from 'vue'
import type { ServerEmoji } from '@/adapters/types'

export const useEmojisStore = defineStore('emojis', () => {
  // host → (shortcode → url) — for fast emoji resolution in notes
  const cache = shallowRef(new Map<string, Record<string, string>>())

  // host → ServerEmoji[] — for the reaction picker (with category/aliases)
  const emojiList = shallowRef(new Map<string, ServerEmoji[]>())

  // In-flight dedup: avoid parallel fetches for the same host
  const pending = new Map<string, Promise<void>>()

  function set(host: string, emojis: ServerEmoji[]) {
    // Build shortcode→url lookup for resolution
    const lookup: Record<string, string> = {}
    for (const e of emojis) {
      lookup[e.name] = e.url
    }

    const nextCache = new Map(cache.value)
    nextCache.set(host, lookup)
    cache.value = nextCache

    const nextList = new Map(emojiList.value)
    nextList.set(host, emojis)
    emojiList.value = nextList

    pending.delete(host)
  }

  function ensureLoaded(
    host: string,
    fetcher: () => Promise<ServerEmoji[]>,
  ): void {
    if (cache.value.has(host) || pending.has(host)) return
    const p = fetcher()
      .then((emojis) => set(host, emojis))
      .catch((e) => {
        console.warn('[emojis] failed to fetch:', host, e)
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
