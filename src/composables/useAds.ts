import { invoke } from '@tauri-apps/api/core'
import { ref } from 'vue'
import type { ServerAd } from '@/adapters/types'

const AD_INTERVAL = 8
const REFRESH_INTERVAL = 10 * 60 * 1000 // 10 minutes

// Per-account ad cache
const adsCache = new Map<string, { ads: ServerAd[]; fetchedAt: number }>()

export function useAds(getAccountId: () => string | undefined) {
  const ads = ref<ServerAd[]>([])

  async function fetchAds() {
    const accountId = getAccountId()
    if (!accountId) return

    const cached = adsCache.get(accountId)
    if (cached && Date.now() - cached.fetchedAt < REFRESH_INTERVAL) {
      ads.value = cached.ads
      return
    }

    try {
      const result = await invoke<ServerAd[]>('api_request', {
        accountId,
        endpoint: 'ads',
      })
      // Filter to only timeline-relevant ads (horizontal), and active today
      const now = new Date()
      const dayOfWeek = now.getDay()
      const filtered = (result ?? []).filter((ad) => {
        if (ad.place !== 'horizontal' && ad.place !== 'square') return false
        if (ad.dayOfWeek !== 7 && ad.dayOfWeek !== dayOfWeek) return false
        return true
      })
      ads.value = filtered
      adsCache.set(accountId, { ads: filtered, fetchedAt: Date.now() })
    } catch {
      // Older servers may not support ads API
      ads.value = []
    }
  }

  /**
   * Pick an ad for a given timeline position using weighted random (ratio).
   * Returns undefined if no ads available.
   */
  function pickAd(index: number): ServerAd | undefined {
    if (ads.value.length === 0) return undefined
    if (ads.value.length === 1) return ads.value[0]

    // Weighted random selection based on ratio
    const totalWeight = ads.value.reduce((sum, ad) => sum + (ad.ratio || 1), 0)
    // Use index as seed for deterministic-ish selection per position
    let pick = ((index * 2654435761) >>> 0) % totalWeight
    for (const ad of ads.value) {
      pick -= ad.ratio || 1
      if (pick < 0) return ad
    }
    return ads.value[0]
  }

  function shouldShowAd(index: number): boolean {
    return ads.value.length > 0 && (index + 1) % AD_INTERVAL === 0
  }

  return { ads, fetchAds, pickAd, shouldShowAd }
}
