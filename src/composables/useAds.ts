import { ref } from 'vue'
import type { ServerAd } from '@/adapters/types'
import { useAccountsStore } from '@/stores/accounts'
import { getStorageJson, STORAGE_KEYS, setStorageJson } from '@/utils/storage'
import { commands, unwrap } from '@/utils/tauriInvoke'

const REFRESH_INTERVAL = 10 * 60 * 1000 // 10 minutes

// Per-account raw ad cache (unfiltered)
const adsCache = new Map<
  string,
  { rawAds: ServerAd[]; notesPerOneAd: number; fetchedAt: number }
>()

function getMutedAds(): string[] {
  return getStorageJson<string[]>(STORAGE_KEYS.mutedAds, [])
}

export function useAds(
  getAccountId: () => string | undefined,
  options?: { filterPlace?: boolean; ignoreMute?: boolean },
) {
  const filterPlace = options?.filterPlace ?? true
  const ignoreMute = options?.ignoreMute ?? false
  const ads = ref<ServerAd[]>([])
  const notesPerOneAd = ref(0)
  const serverHost = ref('')

  async function fetchAds() {
    const accountId = getAccountId()
    if (!accountId) return

    const accountsStore = useAccountsStore()
    const account = accountsStore.accounts.find((a) => a.id === accountId)
    if (account) serverHost.value = account.host

    const cached = adsCache.get(accountId)
    let rawAds: ServerAd[]
    let interval: number

    if (cached && Date.now() - cached.fetchedAt < REFRESH_INTERVAL) {
      rawAds = cached.rawAds
      interval = cached.notesPerOneAd
    } else {
      try {
        if (!account) return

        // Ads are included in /api/meta response (not a separate endpoint)
        const meta = unwrap(
          await commands.apiGetMetaDetail(accountId),
        ) as Record<string, unknown>
        interval =
          typeof meta.notesPerOneAd === 'number' ? meta.notesPerOneAd : 0
        rawAds = Array.isArray(meta.ads) ? (meta.ads as ServerAd[]) : []

        adsCache.set(accountId, {
          rawAds,
          notesPerOneAd: interval,
          fetchedAt: Date.now(),
        })
      } catch {
        ads.value = []
        notesPerOneAd.value = 0
        return
      }
    }

    const dayBit = 1 << new Date().getDay()
    const muted = getMutedAds()
    ads.value = rawAds.filter((ad) => {
      if (filterPlace && ad.place !== 'horizontal' && ad.place !== 'square')
        return false
      if (ad.dayOfWeek !== 0 && (ad.dayOfWeek & dayBit) === 0) return false
      if (!ignoreMute && muted.includes(ad.id)) return false
      return true
    })
    notesPerOneAd.value = interval
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

  function muteAd(adId: string) {
    const muted = getMutedAds()
    if (!muted.includes(adId)) {
      muted.push(adId)
      setStorageJson(STORAGE_KEYS.mutedAds, muted)
    }
    ads.value = ads.value.filter((ad) => ad.id !== adId)
    // Invalidate cache
    const accountId = getAccountId()
    if (accountId) adsCache.delete(accountId)
  }

  return { ads, serverHost, fetchAds, pickAd, shouldShowAd, muteAd }
}
