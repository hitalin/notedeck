import { invoke } from '@tauri-apps/api/core'
import { ref } from 'vue'
import type { OgpData } from '@/utils/ogp'

const OGP_CACHE_MAX = 1024

const ogpCache = new Map<string, OgpData | null>()
const pendingRequests = new Map<string, Promise<OgpData | null>>()

function setOgpCache(url: string, value: OgpData | null) {
  if (ogpCache.size >= OGP_CACHE_MAX) {
    const oldest = ogpCache.keys().next().value
    if (oldest !== undefined) ogpCache.delete(oldest)
  }
  ogpCache.set(url, value)
}

/** Pre-populate the OGP cache from batch IPC results (e.g. timeline enriched) */
export function populateOgpCache(hints: Record<string, OgpData>) {
  for (const [url, data] of Object.entries(hints)) {
    setOgpCache(url, data)
  }
}

export function useOgpPreview(initialUrl: string, accountId?: string) {
  const data = ref<OgpData | null>(null)
  const loading = ref(true)
  let currentUrl = initialUrl

  async function fetchUrl(targetUrl: string) {
    currentUrl = targetUrl
    loading.value = true
    data.value = null

    if (ogpCache.has(targetUrl)) {
      data.value = ogpCache.get(targetUrl) ?? null
      loading.value = false
      return
    }

    let promise = pendingRequests.get(targetUrl)
    if (!promise) {
      promise = invoke<OgpData>('fetch_ogp', {
        url: targetUrl,
        accountId: accountId ?? null,
      })
        .then((result) => {
          setOgpCache(targetUrl, result)
          pendingRequests.delete(targetUrl)
          return result
        })
        .catch(() => {
          setOgpCache(targetUrl, null)
          pendingRequests.delete(targetUrl)
          return null
        })
      pendingRequests.set(targetUrl, promise)
    }

    const result = await promise
    // Only update if still the current URL (guard against race conditions)
    if (currentUrl === targetUrl) {
      data.value = result
      loading.value = false
    }
  }

  async function fetch() {
    await fetchUrl(currentUrl)
  }

  return { data, loading, fetch, fetchUrl }
}
