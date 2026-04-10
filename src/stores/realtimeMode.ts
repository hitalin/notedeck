import { defineStore } from 'pinia'
import { computed } from 'vue'
import { useAccountsStore } from '@/stores/accounts'
import { useOfflineModeStore } from '@/stores/offlineMode'
import { usePerformanceStore } from '@/stores/performance'
import { useSettingsStore } from '@/stores/settings'
import { useStreamingStore } from '@/stores/streaming'

export const useRealtimeModeStore = defineStore('realtimeMode', () => {
  const settingsStore = useSettingsStore()

  /** App-wide realtime (WebSocket) vs polling mode. Backed by settings.json5. */
  const enabled = computed<boolean>({
    get: () => settingsStore.get('modes.realtime') ?? true,
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
