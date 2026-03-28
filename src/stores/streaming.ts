import { defineStore } from 'pinia'
import { shallowRef, triggerRef } from 'vue'
import type { NormalizedUserDetail } from '@/adapters/types'
import { invoke } from '@/utils/tauriInvoke'

export type OnlineStatus = 'online' | 'active' | 'offline' | 'unknown'

export const useStreamingStore = defineStore('streaming', () => {
  /** accountId → OnlineStatus */
  const states = shallowRef<Record<string, OnlineStatus>>({})

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
      states.value[accountId] =
        status && status !== 'unknown' ? status : 'online'
      triggerRef(states)
    } catch {
      states.value[accountId] = 'unknown'
      triggerRef(states)
    }
  }

  function getState(accountId: string): OnlineStatus {
    return states.value[accountId] ?? 'unknown'
  }

  /** Mark an account as disconnected (e.g. on logout) */
  function disconnect(accountId: string): void {
    states.value[accountId] = 'offline'
    triggerRef(states)
  }

  return {
    states,
    fetchOnlineStatus,
    getState,
    disconnect,
  }
})
