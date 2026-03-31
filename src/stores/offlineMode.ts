import { defineStore } from 'pinia'
import { ref } from 'vue'
import { useAccountsStore } from '@/stores/accounts'
import { useStreamingStore } from '@/stores/streaming'
import { useUiStore } from '@/stores/ui'
import {
  getStorageJson,
  getStorageString,
  STORAGE_KEYS,
  setStorageJson,
} from '@/utils/storage'

const STORAGE_KEY = STORAGE_KEYS.offlineMode

interface OfflineModeState {
  enabled: boolean
}

export const useOfflineModeStore = defineStore('offlineMode', () => {
  const isOfflineMode = ref(false)

  /** Restore persisted state from previous session. */
  function init(): void {
    // Migrate from old string-based format
    const raw = getStorageString(STORAGE_KEY)
    if (raw === 'true' || raw === 'false') {
      const enabled = raw === 'true'
      isOfflineMode.value = enabled
      setStorageJson(STORAGE_KEY, { enabled })
      return
    }
    isOfflineMode.value =
      getStorageJson<OfflineModeState | null>(STORAGE_KEY, null)?.enabled ??
      false
  }

  function persist(): void {
    setStorageJson(STORAGE_KEY, { enabled: isOfflineMode.value })
  }

  async function enable(): Promise<void> {
    isOfflineMode.value = true
    persist()

    // Disconnect all streaming connections
    await useStreamingStore().disconnectAll(useAccountsStore().accounts)
  }

  async function disable(): Promise<void> {
    isOfflineMode.value = false
    persist()

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
