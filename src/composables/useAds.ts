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
      const accountsStore = useAccountsStore()
      const account = accountsStore.accounts.find((a) => a.id === accountId)
      if (!account) return

      // Ads are included in /api/meta response (not a separate endpoint)
      const res = await fetch(`https://${account.host}/api/meta`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ detail: true }),
        signal: AbortSignal.timeout(5000),
      })
      const meta = await res.json()
      const interval: number = meta.notesPerOneAd ?? 0
      const rawAds: ServerAd[] = meta.ads ?? []

      // Filter to timeline-relevant ads, active today (dayOfWeek is a bitmask)
      const dayBit = 1 << new Date().getDay()
      const filtered = rawAds.filter((ad) => {
        if (ad.place !== 'horizontal' && ad.place !== 'square') return false
        if ((ad.dayOfWeek & dayBit) === 0) return false
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
      ads.value = []
      notesPerOneAd.value = 0
    }
  }

  /**
   * Pick an ad for a given timeline position using weighted random (ratio).
   */
  function pickAd(index: number): ServerAd | undefined {
    if (ads.value.length === 0) return undefined
    if (ads.value.length === 1) return ads.value[0]

    const totalWeight = ads.value.reduce((sum, ad) => sum + (ad.ratio || 1), 0)
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
