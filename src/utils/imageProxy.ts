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
