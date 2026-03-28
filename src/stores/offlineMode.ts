import { defineStore } from 'pinia'
import { ref } from 'vue'
import { useAccountsStore } from '@/stores/accounts'
import { getStorageJson, setStorageJson } from '@/utils/storage'
import { invoke } from '@/utils/tauriInvoke'

const STORAGE_KEY = 'nd-offline-mode'

interface OfflineModeState {
  enabled: boolean
}

export const useOfflineModeStore = defineStore('offlineMode', () => {
  const isOfflineMode = ref(false)

  /** Restore persisted state from previous session. */
  function init(): void {
    // Migrate from old string-based format
    const raw = localStorage.getItem(STORAGE_KEY)
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
    const accounts = useAccountsStore().accounts
    for (const acc of accounts) {
      if (acc.hasToken) {
        // Fire-and-forget: ignore disconnect errors during offline transition
        invoke('stream_disconnect', { accountId: acc.id }).catch(
          /* noop */ () => undefined,
        )
      }
    }

    window.dispatchEvent(new Event('nd:offline-mode-changed'))
  }

  async function disable(): Promise<void> {
    isOfflineMode.value = false
    persist()

    // Trigger reconnection via existing deck-resume path
    window.dispatchEvent(new Event('deck-resume'))
    window.dispatchEvent(new Event('nd:offline-mode-changed'))
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
