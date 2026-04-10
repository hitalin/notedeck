import { defineStore } from 'pinia'
import { computed, watch } from 'vue'
import { useAccountsStore } from '@/stores/accounts'
import { useSettingsStore } from '@/stores/settings'
import { useStreamingStore } from '@/stores/streaming'
import { useUiStore } from '@/stores/ui'
import { getStorageJson, getStorageString, STORAGE_KEYS } from '@/utils/storage'

const LEGACY_STORAGE_KEY = STORAGE_KEYS.offlineMode

interface LegacyState {
  enabled: boolean
}

/**
 * Load any existing value from legacy localStorage. Used once for migration
 * into `notedeck.json` and as a fallback before settingsStore.load() completes.
 *
 * Two historical formats are supported:
 * - `"true"` / `"false"` (very old — pre-JSON)
 * - `{ enabled: boolean }` (recent)
 */
function loadLegacyState(): boolean | null {
  // Very-old string format
  const rawString = getStorageString(LEGACY_STORAGE_KEY)
  if (rawString === 'true') return true
  if (rawString === 'false') return false

  const rawJson = getStorageJson<LegacyState | null>(LEGACY_STORAGE_KEY, null)
  if (rawJson == null) return null
  return rawJson.enabled ?? false
}

export const useOfflineModeStore = defineStore('offlineMode', () => {
  const settingsStore = useSettingsStore()

  // Snapshot legacy localStorage at store-init time for (a) fallback during
  // the brief window before settingsStore.load() completes and (b) one-time
  // migration into notedeck.json.
  const legacyValue = loadLegacyState()

  // One-time migration: when settingsStore finishes loading, if notedeck.json
  // doesn't yet have `modes.offline`, seed it from the legacy localStorage
  // value (if any) and clear the legacy key.
  watch(
    () => settingsStore.initialized,
    (done) => {
      if (!done) return
      const current = settingsStore.get('modes.offline')
      if (current === undefined && legacyValue !== null) {
        settingsStore.set('modes.offline', legacyValue)
        try {
          localStorage.removeItem(LEGACY_STORAGE_KEY)
        } catch {
          // ignore (non-browser, permissions, etc.)
        }
      }
    },
    { immediate: true },
  )

  /** App-wide offline mode. Backed by notedeck.json `modes.offline`. */
  const isOfflineMode = computed<boolean>({
    get: () => {
      const v = settingsStore.get('modes.offline')
      if (v !== undefined) return v
      // While settingsStore.load() is still pending, fall back to legacy
      // localStorage snapshot (or schema default `false`).
      return legacyValue ?? false
    },
    set: (v) => {
      settingsStore.set('modes.offline', v)
    },
  })

  /**
   * Kept for main.ts compatibility. The new architecture handles initialization
   * via a watch on `settingsStore.initialized`, so this is a no-op. Remove once
   * all callers stop invoking it.
   */
  function init(): void {
    // no-op — initialization happens reactively via the watch above
  }

  async function enable(): Promise<void> {
    isOfflineMode.value = true
    // Disconnect all streaming connections
    await useStreamingStore().disconnectAll(useAccountsStore().accounts)
  }

  async function disable(): Promise<void> {
    isOfflineMode.value = false
    // Trigger reconnection via reactive deck-resume signal
    useUiStore().emitDeckResume()
  }

  async function toggle(): Promise<void> {
    if (isOfflineMode.value) {
      await disable()
    } else {
      await enable()
    }
  }

  return { isOfflineMode, init, enable, disable, toggle }
})
