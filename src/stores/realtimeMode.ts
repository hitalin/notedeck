import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { useAccountsStore } from '@/stores/accounts'
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
  enabled: boolean
  pollingFrequency: PollingFrequency
}

// Migrate from old per-account schema if present
interface LegacyState {
  modeByAccount: Record<string, boolean>
  frequencyByAccount?: Record<string, PollingFrequency>
}

function loadState(): RealtimeModeState {
  const raw = getStorageJson<RealtimeModeState | LegacyState | null>(
    STORAGE_KEY,
    null,
  )
  if (!raw) return { enabled: true, pollingFrequency: 'medium' }

  // Legacy migration: per-account → app-wide
  if ('modeByAccount' in raw) {
    const legacy = raw as LegacyState
    const anyPolling = Object.values(legacy.modeByAccount).some(
      (v) => v === false,
    )
    const firstFreq = legacy.frequencyByAccount
      ? (Object.values(legacy.frequencyByAccount)[0] ?? 'medium')
      : 'medium'
    return { enabled: !anyPolling, pollingFrequency: firstFreq }
  }

  return raw as RealtimeModeState
}

export const useRealtimeModeStore = defineStore('realtimeMode', () => {
  const initial = loadState()
  const enabled = ref(initial.enabled)
  const pollingFrequency = ref<PollingFrequency>(initial.pollingFrequency)

  function persist(): void {
    setStorageJson(STORAGE_KEY, {
      enabled: enabled.value,
      pollingFrequency: pollingFrequency.value,
    })
  }

  /** Whether the app is in real-time (WebSocket) mode. Returns false when offline. */
  const isRealtime = computed(() => {
    if (useOfflineModeStore().isOfflineMode) return false
    return enabled.value
  })

  const pollingIntervalMs = computed(
    () => POLLING_INTERVALS[pollingFrequency.value],
  )

  function applyToAllAccounts(): void {
    const mode = enabled.value ? 'realtime' : 'polling'
    const intervalMs = enabled.value
      ? undefined
      : POLLING_INTERVALS[pollingFrequency.value]
    for (const acc of useAccountsStore().accounts) {
      if (acc.hasToken) {
        invoke('stream_set_mode', {
          accountId: acc.id,
          mode,
          intervalMs,
        }).catch(() => undefined)
      }
    }
  }

  function setRealtimeMode(value: boolean): void {
    enabled.value = value
    persist()
    applyToAllAccounts()
    window.dispatchEvent(new Event('nd:realtime-mode-changed'))
  }

  function toggle(): void {
    setRealtimeMode(!enabled.value)
  }

  function setPollingFrequency(frequency: PollingFrequency): void {
    pollingFrequency.value = frequency
    persist()
    if (!enabled.value) {
      applyToAllAccounts()
    }
  }

  return {
    enabled,
    pollingFrequency,
    pollingIntervalMs,
    isRealtime,
    setRealtimeMode,
    toggle,
    setPollingFrequency,
  }
})
