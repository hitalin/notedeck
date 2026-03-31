/**
 * MFM cache layer — wraps the pure parser (mfmParser.ts) with an LRU cache.
 * Re-exports parser types and functions for convenience.
 */
import { usePerformanceStore } from '@/stores/performance'
import type { MfmToken } from './mfmParser'
import { parseTokens } from './mfmParser'

export type { MfmToken } from './mfmParser'
export { parseTokens } from './mfmParser'

const parseCache = new Map<string, MfmToken[]>()
const MAX_MFM_LENGTH = 10000

function getMfmCacheMax(): number {
  try {
    return usePerformanceStore().get('mfmCacheMax')
  } catch {
    return 256
  }
}

export function parseMfm(text: string): MfmToken[] {
  if (!text) return []

  // Prevent excessive CPU/memory from extremely long MFM input
  if (text.length > MAX_MFM_LENGTH) {
    return [{ type: 'text', value: text }]
  }

  const cached = parseCache.get(text)
  if (cached) {
    // LRU: move to end so it's evicted last
    parseCache.delete(text)
    parseCache.set(text, cached)
    return cached
  }

  const tokens = parseTokens(text)

  const cacheMax = getMfmCacheMax()
  if (parseCache.size >= cacheMax) {
    const first = parseCache.keys().next().value
    if (first !== undefined) parseCache.delete(first)
  }
  parseCache.set(text, tokens)

  return tokens
}

/** Check if a text is already in the parse cache. */
export function parseCacheHas(text: string): boolean {
  return parseCache.has(text)
}

/** Inject pre-parsed tokens into the cache (e.g. from a Web Worker). */
export function warmCache(text: string, tokens: MfmToken[]): void {
  if (parseCache.has(text)) return
  const cacheMax = getMfmCacheMax()
  if (parseCache.size >= cacheMax) {
    const first = parseCache.keys().next().value
    if (first !== undefined) parseCache.delete(first)
  }
  parseCache.set(text, tokens)
}
