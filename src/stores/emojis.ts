import { defineStore } from 'pinia'
import { shallowRef } from 'vue'

export const useEmojisStore = defineStore('emojis', () => {
  // host → (shortcode → url)
  // shallowRef + full Map replacement avoids deep reactivity on emoji records
  const cache = shallowRef(new Map<string, Record<string, string>>())

  function set(host: string, emojis: Record<string, string>) {
    const next = new Map(cache.value)
    next.set(host, emojis)
    cache.value = next
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

  return { cache, set, resolve, has }
})
