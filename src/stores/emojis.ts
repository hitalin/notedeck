import { defineStore } from 'pinia'
import { shallowRef } from 'vue'

export const useEmojisStore = defineStore('emojis', () => {
  // host → (shortcode → url)
  // shallowRef + full Map replacement avoids deep reactivity on emoji records
  const cache = shallowRef(new Map<string, Record<string, string>>())

  // In-flight dedup: avoid parallel fetches for the same host
  const pending = new Map<string, Promise<void>>()

  function set(host: string, emojis: Record<string, string>) {
    const next = new Map(cache.value)
    next.set(host, emojis)
    cache.value = next
    pending.delete(host)
  }

  function ensureLoaded(
    host: string,
    fetcher: () => Promise<Record<string, string>>,
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
    // Try exact match first, then without @. suffix
    return map[shortcode] || map[shortcode.replace(/@\.$/, '')] || null
  }

  function has(host: string): boolean {
    return cache.value.has(host)
  }

  return { cache, set, ensureLoaded, resolve, has }
})
