import JSON5 from 'json5'
import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import type { ServerSoftware } from '@/adapters/types'
import { readAccountOrder, writeAccountOrder } from '@/utils/settingsFs'
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

  /** Cached order loaded from file (set once before applyAccounts runs). */
  let savedOrderIds: string[] | null = null

  function applyAccounts(stored: Account[]): void {
    if (savedOrderIds && savedOrderIds.length > 0) {
      const byId = new Map(stored.map((a) => [a.id, a]))
      const ordered: Account[] = []
      for (const id of savedOrderIds) {
        const acc = byId.get(id)
        if (acc) {
          ordered.push(acc)
          byId.delete(id)
        }
      }
      // Append any new accounts not in saved order
      for (const acc of byId.values()) ordered.push(acc)
      accounts.value = ordered
    } else {
      accounts.value = stored
    }
    if (stored.length > 0 && !activeAccountId.value) {
      activeAccountId.value = accounts.value[0]?.id ?? null
    }
    isLoaded.value = true
  }

  function cleanupEarlyListener(): void {
    earlyUnlisten?.()
    earlyUnlisten = null
  }

  /** Listen for `nd:accounts-early` Tauri event (fires before full AppState init).
   *  Whichever arrives first — this event or the invoke() result — populates the store. */
  async function listenEarlyAccounts(): Promise<void> {
    const { listen } = await import('@tauri-apps/api/event')
    earlyUnlisten = await listen<Account[]>('nd:accounts-early', (event) => {
      if (!isLoaded.value) applyAccounts(event.payload)
      cleanupEarlyListener()
    })
    if (isLoaded.value) cleanupEarlyListener()
  }

  function loadAccounts(): Promise<void> {
    if (loadPromise) return loadPromise
    listenEarlyAccounts()
    loadPromise = (async () => {
      // Load saved order from file before applying accounts
      try {
        const raw = await readAccountOrder()
        if (raw) savedOrderIds = JSON5.parse(raw)
      } catch {
        /* missing or corrupt file, use default order */
      }
      const stored = await invoke<Account[]>('load_accounts')
      if (!isLoaded.value) applyAccounts(stored)
      cleanupEarlyListener()
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
    removeStorage(STORAGE_KEYS.policies(id))
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

  function saveAccountOrder(): void {
    const ids = accounts.value.map((a) => a.id)
    writeAccountOrder(JSON5.stringify(ids, null, 2)).catch(() => {
      /* write failure, ignore */
    })
  }

  function reorderAccount(fromIndex: number, toIndex: number): void {
    const arr = [...accounts.value]
    const [moved] = arr.splice(fromIndex, 1)
    if (moved) {
      arr.splice(toIndex, 0, moved)
      accounts.value = arr
      saveAccountOrder()
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
    reorderAccount,
    modeVersionByAccount,
    getModeVersion,
    bumpModeVersion,
  }
})
