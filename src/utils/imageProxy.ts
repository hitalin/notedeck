const PROXY_BASE = 'http://127.0.0.1:19820/proxy/image'
const IS_MOBILE = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent)
const CACHE_MAX = 512
const proxyUrlCache = new Map<string, string>()

function evictIfFull() {
  if (proxyUrlCache.size >= CACHE_MAX) {
    // Map iterates in insertion order; delete the oldest entry
    const oldest = proxyUrlCache.keys().next().value
    if (oldest !== undefined) proxyUrlCache.delete(oldest)
  }
}

export function proxyUrl(url: string | null | undefined): string | undefined {
  if (!url || !url.startsWith('https://')) return url ?? undefined
  if (IS_MOBILE) return url
  let cached = proxyUrlCache.get(url)
  if (!cached) {
    evictIfFull()
    cached = `${PROXY_BASE}?url=${encodeURIComponent(url)}`
    proxyUrlCache.set(url, cached)
  }
  return cached
}

/**
 * Generate a proxy URL with thumbnail resize and optional WebP conversion.
 * Used for timeline images where the display size is much smaller than the original.
 */
export function proxyThumbUrl(
  url: string | null | undefined,
  width: number,
): string | undefined {
  if (!url || !url.startsWith('https://')) return url ?? undefined
  if (IS_MOBILE) return url
  const key = `${url}|w=${width}`
  let cached = proxyUrlCache.get(key)
  if (!cached) {
    evictIfFull()
    cached = `${PROXY_BASE}?url=${encodeURIComponent(url)}&w=${width}&format=webp`
    proxyUrlCache.set(key, cached)
  }
  return cached
}
