import { defineStore } from 'pinia'
import { computed, watch } from 'vue'
import { useAccountsStore } from '@/stores/accounts'
import { useOfflineModeStore } from '@/stores/offlineMode'
import { usePerformanceStore } from '@/stores/performance'
import { useSettingsStore } from '@/stores/settings'
import { useStreamingStore } from '@/stores/streaming'
import { getStorageJson } from '@/utils/storage'

const LEGACY_STORAGE_KEY = 'nd-realtime-mode'

interface LegacyState {
  enabled: boolean
}

// Older schema (pre-app-wide): per-account mode
interface VeryLegacyState {
  modeByAccount: Record<string, boolean>
}

/**
 * Load the existing value from localStorage (legacy storage) so we can
 * migrate it into `notedeck.json` once settingsStore finishes loading.
 *
 * Returns null if no legacy value exists.
 */
function loadLegacyState(): boolean | null {
  const raw = getStorageJson<LegacyState | VeryLegacyState | null>(
    LEGACY_STORAGE_KEY,
    null,
  )
  if (!raw) return null

  if ('modeByAccount' in raw) {
    // Very old per-account schema → collapse to app-wide
    const legacy = raw as VeryLegacyState
    const anyPolling = Object.values(legacy.modeByAccount).some(
      (v) => v === false,
    )
    return !anyPolling
  }

  return (raw as LegacyState).enabled ?? true
}

export const useRealtimeModeStore = defineStore('realtimeMode', () => {
  const settingsStore = useSettingsStore()

  // Snapshot any legacy localStorage value at store init time. It's used as
  // (a) the fallback during the brief window before settingsStore.load() completes
  // (b) the source for one-time migration into notedeck.json
  const legacyValue = loadLegacyState()

  // One-time migration: when settingsStore finishes loading, if notedeck.json
  // doesn't yet have `modes.realtime`, seed it from the legacy localStorage value
  // (if any) and clear the legacy key.
  watch(
    () => settingsStore.initialized,
    (done) => {
      if (!done) return
      const current = settingsStore.get('modes.realtime')
      if (current === undefined && legacyValue !== null) {
        settingsStore.set('modes.realtime', legacyValue)
        try {
          localStorage.removeItem(LEGACY_STORAGE_KEY)
        } catch {
          // ignore (non-browser environment, permissions, etc.)
        }
      }
    },
    { immediate: true },
  )

  /** App-wide realtime (WebSocket) vs polling mode. Backed by notedeck.json. */
  const enabled = computed<boolean>({
    get: () => {
      const v = settingsStore.get('modes.realtime')
      if (v !== undefined) return v
      // While settingsStore.load() is still pending, fall back to the legacy
      // localStorage snapshot (or the schema default `true`).
      return legacyValue ?? true
    },
    set: (v) => {
      settingsStore.set('modes.realtime', v)
    },
  })

  /** Effective mode: forced off when the app is in offline mode. */
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
