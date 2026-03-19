const PROXY_BASE = 'http://127.0.0.1:19820/proxy/image'
const IS_MOBILE = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent)
const proxyUrlCache = new Map<string, string>()

export function proxyUrl(url: string | null | undefined): string | undefined {
  if (!url || !url.startsWith('https://')) return url ?? undefined
  if (IS_MOBILE) return url
  let cached = proxyUrlCache.get(url)
  if (!cached) {
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
    cached = `${PROXY_BASE}?url=${encodeURIComponent(url)}&w=${width}&format=webp`
    proxyUrlCache.set(key, cached)
  }
  return cached
}
