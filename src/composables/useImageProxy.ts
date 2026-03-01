const PROXY_BASE = 'http://127.0.0.1:19820/proxy/image'

export function proxyUrl(url: string | null | undefined): string | undefined {
  if (!url || !url.startsWith('https://')) return url ?? undefined
  return `${PROXY_BASE}?url=${encodeURIComponent(url)}`
}
