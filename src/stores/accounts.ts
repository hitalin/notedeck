import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { invoke } from '@tauri-apps/api/core'
import type { ServerSoftware } from '@/adapters/types'

export interface Account {
  id: string
  host: string
  token: string
  userId: string
  username: string
  displayName: string | null
  avatarUrl: string | null
  software: ServerSoftware
}

export const useAccountsStore = defineStore('accounts', () => {
  const accounts = ref<Account[]>([])
  const activeAccountId = ref<string | null>(null)
  const isLoaded = ref(false)

  const activeAccount = computed(
    () => accounts.value.find((a) => a.id === activeAccountId.value) ?? null,
  )

  const accountsByServer = computed(() => {
    const map = new Map<string, Account[]>()
    for (const acc of accounts.value) {
      const list = map.get(acc.host) ?? []
      list.push(acc)
      map.set(acc.host, list)
    }
    return map
  })

  async function loadAccounts(): Promise<void> {
    // Deduplication is handled by UNIQUE(host, user_id) constraint in SQLite
    const stored = await invoke<Account[]>('load_accounts')
    accounts.value = stored
    if (accounts.value.length > 0 && !activeAccountId.value) {
      activeAccountId.value = accounts.value[0]!.id
    }
    isLoaded.value = true
  }

  async function addAccount(account: Account): Promise<void> {
    // UPSERT handled by Rust side (ON CONFLICT)
    await invoke('upsert_account', { account })

    const idx = accounts.value.findIndex(
      (a) => a.host === account.host && a.userId === account.userId,
    )
    if (idx >= 0) {
      accounts.value[idx] = account
    } else {
      accounts.value.push(account)
    }
    if (!activeAccountId.value) {
      activeAccountId.value = account.id
    }
  }

  async function removeAccount(id: string): Promise<void> {
    await invoke('delete_account', { id })
    accounts.value = accounts.value.filter((a) => a.id !== id)
    if (activeAccountId.value === id) {
      activeAccountId.value = accounts.value[0]?.id ?? null
    }
  }

  function switchAccount(id: string): void {
    if (accounts.value.some((a) => a.id === id)) {
      activeAccountId.value = id
    }
  }

  return {
    accounts,
    activeAccountId,
    activeAccount,
    accountsByServer,
    isLoaded,
    loadAccounts,
    addAccount,
    removeAccount,
    switchAccount,
  }
})
