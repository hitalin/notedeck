import { invoke } from '@tauri-apps/api/core'
import { ref } from 'vue'
import type { ServerAd } from '@/adapters/types'
import { useAccountsStore } from '@/stores/accounts'

const REFRESH_INTERVAL = 10 * 60 * 1000 // 10 minutes

// Per-account ad cache
const adsCache = new Map<
  string,
  { ads: ServerAd[]; notesPerOneAd: number; fetchedAt: number }
>()

export function useAds(getAccountId: () => string | undefined) {
  const ads = ref<ServerAd[]>([])
  const notesPerOneAd = ref(0)

  async function fetchAds() {
    const accountId = getAccountId()
    if (!accountId) return

    const cached = adsCache.get(accountId)
    if (cached && Date.now() - cached.fetchedAt < REFRESH_INTERVAL) {
      ads.value = cached.ads
      notesPerOneAd.value = cached.notesPerOneAd
      return
    }

    try {
      // Fetch notesPerOneAd from server meta
      const accountsStore = useAccountsStore()
      const account = accountsStore.accounts.find((a) => a.id === accountId)
      let interval = 0
      if (account) {
        try {
          const meta = await fetch(`https://${account.host}/api/meta`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: '{}',
            signal: AbortSignal.timeout(5000),
          })
          const metaData = await meta.json()
          interval = metaData.notesPerOneAd ?? 0
        } catch {
          // Fallback: server may not expose this field
        }
      }

      const result = await invoke<ServerAd[]>('api_request', {
        accountId,
        endpoint: 'ads',
      })
      // Filter to only timeline-relevant ads, and active today
      const now = new Date()
      const dayOfWeek = now.getDay()
      const filtered = (result ?? []).filter((ad) => {
        if (ad.place !== 'horizontal' && ad.place !== 'square') return false
        if (ad.dayOfWeek !== 7 && ad.dayOfWeek !== dayOfWeek) return false
        return true
      })
      ads.value = filtered
      notesPerOneAd.value = interval
      adsCache.set(accountId, {
        ads: filtered,
        notesPerOneAd: interval,
        fetchedAt: Date.now(),
      })
    } catch {
      // Older servers may not support ads API
      ads.value = []
      notesPerOneAd.value = 0
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
    if (ads.value.length === 0 || notesPerOneAd.value <= 0) return false
    return (index + 1) % notesPerOneAd.value === 0
  }

  return { ads, fetchAds, pickAd, shouldShowAd }
}
