import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { useOfflineModeStore } from '@/stores/offlineMode'
import { getStorageJson, setStorageJson } from '@/utils/storage'
import { invoke } from '@/utils/tauriInvoke'

export type PollingFrequency = 'low' | 'medium' | 'high'

const STORAGE_KEY = 'nd-realtime-mode'

const POLLING_INTERVALS: Record<PollingFrequency, number> = {
  low: 30_000,
  medium: 15_000,
  high: 5_000,
}

interface RealtimeModeState {
  modeByAccount: Record<string, boolean>
  frequencyByAccount: Record<string, PollingFrequency>
}

export const useRealtimeModeStore = defineStore('realtimeMode', () => {
  // Restore persisted state immediately on store creation
  const saved = getStorageJson<RealtimeModeState | null>(STORAGE_KEY, null)
  const modeByAccount = ref<Record<string, boolean>>(saved?.modeByAccount ?? {})
  const frequencyByAccount = ref<Record<string, PollingFrequency>>(
    saved?.frequencyByAccount ?? {},
  )

  function persist(): void {
    setStorageJson(STORAGE_KEY, {
      modeByAccount: modeByAccount.value,
      frequencyByAccount: frequencyByAccount.value,
    })
  }

  /** Whether the account is in real-time (WebSocket) mode. Returns false when offline. */
  function isRealtimeMode(accountId: string): boolean {
    if (useOfflineModeStore().isOfflineMode) return false
    return modeByAccount.value[accountId] !== false
  }

  /** All accounts that are explicitly in polling mode. */
  const pollingAccountIds = computed(() =>
    Object.entries(modeByAccount.value)
      .filter(([, v]) => v === false)
      .map(([k]) => k),
  )

  function setRealtimeMode(accountId: string, enabled: boolean): void {
    modeByAccount.value[accountId] = enabled
    persist()

    const mode = enabled ? 'realtime' : 'polling'
    const intervalMs = enabled ? undefined : getPollingIntervalMs(accountId)

    // Fire-and-forget: Rust command may not exist yet (PR 2)
    invoke('stream_set_mode', { accountId, mode, intervalMs }).catch(
      () => undefined,
    )

    window.dispatchEvent(new Event('nd:realtime-mode-changed'))
  }

  function toggleRealtimeMode(accountId: string): void {
    setRealtimeMode(accountId, !isRealtimeMode(accountId))
  }

  function getPollingFrequency(accountId: string): PollingFrequency {
    return frequencyByAccount.value[accountId] ?? 'medium'
  }

  function setPollingFrequency(
    accountId: string,
    frequency: PollingFrequency,
  ): void {
    frequencyByAccount.value[accountId] = frequency
    persist()

    // If already in polling mode, update the interval on Rust side
    if (!isRealtimeMode(accountId)) {
      invoke('stream_set_mode', {
        accountId,
        mode: 'polling',
        intervalMs: POLLING_INTERVALS[frequency],
      }).catch(() => undefined)
    }
  }

  function getPollingIntervalMs(accountId: string): number {
    return POLLING_INTERVALS[getPollingFrequency(accountId)]
  }

  /** Remove settings for a deleted account. */
  function removeAccount(accountId: string): void {
    delete modeByAccount.value[accountId]
    delete frequencyByAccount.value[accountId]
    persist()
  }

  return {
    modeByAccount,
    frequencyByAccount,
    pollingAccountIds,
    isRealtimeMode,
    setRealtimeMode,
    toggleRealtimeMode,
    getPollingFrequency,
    setPollingFrequency,
    getPollingIntervalMs,
    removeAccount,
  }
})
