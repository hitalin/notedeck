import { invoke } from '@tauri-apps/api/core'
import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import type { ServerSoftware } from '@/adapters/types'

export interface Account {
  id: string
  host: string
  userId: string
  username: string
  displayName: string | null
  avatarUrl: string | null
  software: ServerSoftware
  hasToken: boolean
}

const GUEST_USER_ID = '__guest__'

export function isGuestAccount(account: Account): boolean {
  return account.userId === GUEST_USER_ID && !account.hasToken
}

export function getAccountAvatarUrl(account: Account): string {
  if (isGuestAccount(account)) return '/avatar-guest.svg'
  return account.avatarUrl || '/avatar-default.svg'
}

export const useAccountsStore = defineStore('accounts', () => {
  const accounts = ref<Account[]>([])
  const activeAccountId = ref<string | null>(null)
  const isLoaded = ref(false)
  const modeVersion = ref(0)

  const accountMap = computed(() => {
    const map = new Map<string, Account>()
    for (const acc of accounts.value) map.set(acc.id, acc)
    return map
  })

  const activeAccount = computed(
    () =>
      (activeAccountId.value
        ? accountMap.value.get(activeAccountId.value)
        : null) ?? null,
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

  let loadPromise: Promise<void> | null = null

  function loadAccounts(): Promise<void> {
    if (loadPromise) return loadPromise
    loadPromise = (async () => {
      // Deduplication is handled by UNIQUE(host, user_id) constraint in SQLite
      const stored = await invoke<Account[]>('load_accounts')
      accounts.value = stored
      if (accounts.value.length > 0 && !activeAccountId.value) {
        activeAccountId.value = accounts.value[0]?.id ?? null
      }
      isLoaded.value = true
    })()
    return loadPromise
  }

  function addAccount(account: Account): void {
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
    // Clean up localStorage caches associated with this account
    localStorage.removeItem(`nd-drafts-${id}`)
    localStorage.removeItem(`nd-cache-notifications-${id}`)
  }

  async function logoutAccount(id: string): Promise<void> {
    await invoke('logout_account', { id })
    const account = accounts.value.find((a) => a.id === id)
    if (account) account.hasToken = false
  }

  function switchAccount(id: string): void {
    if (accounts.value.some((a) => a.id === id)) {
      activeAccountId.value = id
    }
  }

  function bumpModeVersion(): void {
    modeVersion.value++
  }

  return {
    accounts,
    activeAccountId,
    activeAccount,
    accountMap,
    accountsByServer,
    isLoaded,
    loadAccounts,
    addAccount,
    removeAccount,
    logoutAccount,
    switchAccount,
    modeVersion,
    bumpModeVersion,
  }
})
