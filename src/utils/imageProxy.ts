const PROXY_BASE = 'http://127.0.0.1:19820/proxy/image'
const IS_MOBILE = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent)

export function proxyUrl(url: string | null | undefined): string | undefined {
  if (!url || !url.startsWith('https://')) return url ?? undefined
  if (IS_MOBILE) return url
  return `${PROXY_BASE}?url=${encodeURIComponent(url)}`
}
