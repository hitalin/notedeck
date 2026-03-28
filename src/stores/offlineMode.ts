import { defineStore } from 'pinia'
import { ref } from 'vue'
import { useAccountsStore } from '@/stores/accounts'
import { setStorageString } from '@/utils/storage'
import { invoke } from '@/utils/tauriInvoke'

const STORAGE_KEY = 'nd-offline-mode'

export const useOfflineModeStore = defineStore('offlineMode', () => {
  const isOfflineMode = ref(false)

  /** Restore persisted state (always starts as false for safety). */
  function init(): void {
    // Intentionally do NOT restore — app always starts online.
    // The key is kept for future consideration.
    isOfflineMode.value = false
  }

  async function enable(): Promise<void> {
    isOfflineMode.value = true
    setStorageString(STORAGE_KEY, 'true')

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
    setStorageString(STORAGE_KEY, 'false')

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
