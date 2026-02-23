import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import type { ServerSoftware } from '@/adapters/types'
import { db } from '@/db'

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
    const stored = await db.accounts.toArray()

    // Deduplicate by host+userId (keep first, remove extras from DB)
    const seen = new Map<string, Account>()
    const dupeIds: string[] = []
    for (const acc of stored) {
      const key = `${acc.host}:${acc.userId}`
      if (seen.has(key)) {
        dupeIds.push(acc.id)
      } else {
        seen.set(key, acc)
      }
    }
    if (dupeIds.length > 0) {
      await db.accounts.bulkDelete(dupeIds)
    }

    accounts.value = [...seen.values()]
    if (accounts.value.length > 0 && !activeAccountId.value) {
      activeAccountId.value = accounts.value[0].id
    }
    isLoaded.value = true
  }

  async function addAccount(account: Account): Promise<void> {
    // Check in-memory first, then DB for dedup (handles case where loadAccounts hasn't run)
    let existingId: string | undefined
    const inMemory = accounts.value.find(
      (a) => a.host === account.host && a.userId === account.userId,
    )
    if (inMemory) {
      existingId = inMemory.id
    } else {
      const inDb = await db.accounts
        .filter((a) => a.host === account.host && a.userId === account.userId)
        .first()
      if (inDb) {
        existingId = inDb.id
      }
    }

    if (existingId) {
      const updated = { ...account, id: existingId }
      await db.accounts.put(updated)
      const idx = accounts.value.findIndex((a) => a.id === existingId)
      if (idx >= 0) {
        accounts.value[idx] = updated
      }
    } else {
      await db.accounts.put(account)
      accounts.value.push(account)
    }
    if (!activeAccountId.value) {
      activeAccountId.value = account.id
    }
  }

  async function removeAccount(id: string): Promise<void> {
    await db.accounts.delete(id)
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
