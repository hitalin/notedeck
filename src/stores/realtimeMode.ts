import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { useAccountsStore } from '@/stores/accounts'
import { useOfflineModeStore } from '@/stores/offlineMode'
import { usePerformanceStore } from '@/stores/performance'
import { useStreamingStore } from '@/stores/streaming'
import { getStorageJson, setStorageJson } from '@/utils/storage'

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
    useStreamingStore().setModeAll(
      useAccountsStore().accounts,
      mode,
      intervalMs,
    )
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
