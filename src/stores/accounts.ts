import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import type { ServerSoftware } from '@/adapters/types'
import { removeStorage, STORAGE_KEYS } from '@/utils/storage'
import { invoke } from '@/utils/tauriInvoke'

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

export function getAccountLabel(account: Account): string {
  if (isGuestAccount(account)) {
    const name = account.displayName || 'ゲスト'
    return `${name}@${account.host}`
  }
  return `@${account.username}@${account.host}`
}

export const useAccountsStore = defineStore('accounts', () => {
  const accounts = ref<Account[]>([])
  const activeAccountId = ref<string | null>(null)
  const isLoaded = ref(false)
  const modeVersionByAccount = ref<Record<string, number>>({})

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
  let earlyUnlisten: (() => void) | null = null

  /** Accept accounts from the early Tauri event (fires before AppState.initialize). */
  function applyAccounts(stored: Account[]): void {
    accounts.value = stored
    if (stored.length > 0 && !activeAccountId.value) {
      activeAccountId.value = stored[0]?.id ?? null
    }
    isLoaded.value = true
  }

  /**
   * Listen for the early `nd:accounts-early` Tauri event emitted from Rust
   * before AppState is ready. If it arrives before the invoke() resolves,
   * the store is populated immediately — bypassing the AppState readiness gate.
   */
  function listenEarlyAccounts(): void {
    import('@tauri-apps/api/event').then(({ listen }) => {
      listen<Account[]>('nd:accounts-early', (event) => {
        if (!isLoaded.value) {
          applyAccounts(event.payload)
        }
        earlyUnlisten?.()
        earlyUnlisten = null
      }).then((fn) => {
        // If already loaded (invoke was faster), clean up immediately
        if (isLoaded.value) {
          fn()
        } else {
          earlyUnlisten = fn
        }
      })
    })
  }

  function loadAccounts(): Promise<void> {
    if (loadPromise) return loadPromise
    listenEarlyAccounts()
    loadPromise = (async () => {
      // Deduplication is handled by UNIQUE(host, user_id) constraint in SQLite
      const stored = await invoke<Account[]>('load_accounts')
      // Only apply if early event hasn't already populated
      if (!isLoaded.value) {
        applyAccounts(stored)
      }
      earlyUnlisten?.()
      earlyUnlisten = null
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
    removeStorage(STORAGE_KEYS.drafts(id))
    removeStorage(STORAGE_KEYS.notificationCache(id))
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

  function getModeVersion(accountId: string): number {
    return modeVersionByAccount.value[accountId] ?? 0
  }

  function bumpModeVersion(accountId: string): void {
    modeVersionByAccount.value = {
      ...modeVersionByAccount.value,
      [accountId]: (modeVersionByAccount.value[accountId] ?? 0) + 1,
    }
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
    modeVersionByAccount,
    getModeVersion,
    bumpModeVersion,
  }
})
