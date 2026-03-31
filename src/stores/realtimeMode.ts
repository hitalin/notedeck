import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { useAccountsStore } from '@/stores/accounts'
import { useOfflineModeStore } from '@/stores/offlineMode'
import { usePerformanceStore } from '@/stores/performance'
import { getStorageJson, setStorageJson } from '@/utils/storage'
import { invoke } from '@/utils/tauriInvoke'

const STORAGE_KEY = 'nd-realtime-mode'

interface RealtimeModeState {
  enabled: boolean
}

// Migrate from old per-account schema if present
interface LegacyState {
  modeByAccount: Record<string, boolean>
}

function loadState(): RealtimeModeState {
  const raw = getStorageJson<RealtimeModeState | LegacyState | null>(
    STORAGE_KEY,
    null,
  )
  if (!raw) return { enabled: true }

  // Legacy migration: per-account → app-wide
  if ('modeByAccount' in raw) {
    const legacy = raw as LegacyState
    const anyPolling = Object.values(legacy.modeByAccount).some(
      (v) => v === false,
    )
    return { enabled: !anyPolling }
  }

  return { enabled: (raw as RealtimeModeState).enabled ?? true }
}

export const useRealtimeModeStore = defineStore('realtimeMode', () => {
  const initial = loadState()
  const enabled = ref(initial.enabled)

  function persist(): void {
    setStorageJson(STORAGE_KEY, { enabled: enabled.value })
  }

  /** Whether the app is in real-time (WebSocket) mode. Returns false when offline. */
  const isRealtime = computed(() => {
    if (useOfflineModeStore().isOfflineMode) return false
    return enabled.value
  })

  function getPollingIntervalMs(): number {
    return usePerformanceStore().get('streamPollingInterval') * 1000
  }

  function applyToAllAccounts(): void {
    const mode = enabled.value ? 'realtime' : 'polling'
    const intervalMs = enabled.value ? undefined : getPollingIntervalMs()
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
  }

  function toggle(): void {
    setRealtimeMode(!enabled.value)
  }

  return {
    enabled,
    isRealtime,
    setRealtimeMode,
    toggle,
  }
})
