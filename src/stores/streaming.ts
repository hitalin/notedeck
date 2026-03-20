import { invoke } from '@tauri-apps/api/core'
import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { NormalizedUserDetail } from '@/adapters/types'

export type OnlineStatus = 'online' | 'active' | 'offline' | 'unknown'

export const useStreamingStore = defineStore('streaming', () => {
  /** accountId → OnlineStatus */
  const states = ref<Record<string, OnlineStatus>>({})

  /** Fetch onlineStatus from users/show API for a given account */
  async function fetchOnlineStatus(
    accountId: string,
    userId: string,
  ): Promise<void> {
    try {
      const detail = await invoke<NormalizedUserDetail>('api_get_user_detail', {
        accountId,
        userId,
      })
      const status = detail.onlineStatus
      // API success = server reachable.
      // 'unknown' means hidden status — for own account, treat as 'online'
      states.value = {
        ...states.value,
        [accountId]: status && status !== 'unknown' ? status : 'online',
      }
    } catch {
      states.value = { ...states.value, [accountId]: 'unknown' }
    }
  }

  function getState(accountId: string): OnlineStatus {
    return states.value[accountId] ?? 'unknown'
  }

  /** Mark an account as disconnected (e.g. on logout) */
  function disconnect(accountId: string): void {
    states.value = { ...states.value, [accountId]: 'offline' }
  }

  return {
    states,
    fetchOnlineStatus,
    getState,
    disconnect,
  }
})
