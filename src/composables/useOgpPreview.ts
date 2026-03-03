import { invoke } from '@tauri-apps/api/core'
import { ref } from 'vue'
import type { OgpData } from '@/utils/ogp'

const ogpCache = new Map<string, OgpData | null>()
const pendingRequests = new Map<string, Promise<OgpData | null>>()

export function useOgpPreview(url: string, accountId?: string) {
  const data = ref<OgpData | null>(null)
  const loading = ref(true)

  async function fetch() {
    if (ogpCache.has(url)) {
      data.value = ogpCache.get(url) ?? null
      loading.value = false
      return
    }

    let promise = pendingRequests.get(url)
    if (!promise) {
      promise = invoke<OgpData>('fetch_ogp', {
        url,
        accountId: accountId ?? null,
      })
        .then((result) => {
          ogpCache.set(url, result)
          pendingRequests.delete(url)
          return result
        })
        .catch(() => {
          ogpCache.set(url, null)
          pendingRequests.delete(url)
          return null
        })
      pendingRequests.set(url, promise)
    }

    const result = await promise
    data.value = result
    loading.value = false
  }

  return { data, loading, fetch }
}
