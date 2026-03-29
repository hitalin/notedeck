const inflight = new Map<string, Promise<unknown>>()
const responseCache = new Map<string, { data: unknown; expiresAt: number }>()

/** Default response cache TTL in milliseconds. */
const CACHE_TTL_MS = 5000

export function dedup<T>(key: string, fn: () => Promise<T>): Promise<T> {
  // Return cached response if fresh (avoids API call on rapid tab switches)
  const cached = responseCache.get(key)
  if (cached && cached.expiresAt > Date.now()) {
    return Promise.resolve(cached.data as T)
  }

  const existing = inflight.get(key) as Promise<T> | undefined
  if (existing) return existing

  const p = fn()
    .then((data) => {
      responseCache.set(key, { data, expiresAt: Date.now() + CACHE_TTL_MS })
      return data
    })
    .finally(() => inflight.delete(key))
  inflight.set(key, p)
  return p
}
