import { defineStore } from 'pinia'
import { reactive } from 'vue'

export const useEmojisStore = defineStore('emojis', () => {
  // host → (shortcode → url)
  const cache = reactive(new Map<string, Record<string, string>>())

  function set(host: string, emojis: Record<string, string>) {
    cache.set(host, emojis)
  }

  function resolve(host: string, shortcode: string): string | null {
    const map = cache.get(host)
    if (!map) return null
    // Try exact match first, then without @. suffix
    return map[shortcode] || map[shortcode.replace(/@\.$/, '')] || null
  }

  function has(host: string): boolean {
    return cache.has(host)
  }

  return { cache, set, resolve, has }
})
