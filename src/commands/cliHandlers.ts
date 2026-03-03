import { invoke } from '@tauri-apps/api/core'
import type { useAccountsStore } from '@/stores/accounts'
import type { useDeckStore } from '@/stores/deck'
import type { CliCommandName } from './cliParser'

export interface CliHandlerDeps {
  deckStore: ReturnType<typeof useDeckStore>
  accountsStore: ReturnType<typeof useAccountsStore>
  navigateToNote: (accountId: string, noteId: string) => void
  toggleAccountMenu: () => void
}

export type CliHandlers = Record<
  CliCommandName,
  (args: string) => void | Promise<void>
>

export function createCliHandlers(deps: CliHandlerDeps): CliHandlers {
  return {
    post: async (args) => {
      const accountId = deps.accountsStore.activeAccount?.id
      if (!accountId || !args.trim()) return
      await invoke('api_create_note', {
        accountId,
        text: args.trim(),
        visibility: 'public',
      })
    },

    search: (args) => {
      const accountId = deps.accountsStore.activeAccount?.id
      if (!accountId || !args.trim()) return
      deps.deckStore.addColumn({
        type: 'search',
        accountId,
        query: args.trim(),
        name: null,
        width: 380,
      })
    },

    tl: (args) => {
      const accountId = deps.accountsStore.activeAccount?.id
      if (!accountId) return
      const type = (args.trim() || 'home') as string
      const existing = deps.deckStore.columns.find(
        (c) =>
          c.type === 'timeline' && c.tl === type && c.accountId === accountId,
      )
      if (existing) {
        deps.deckStore.setActiveColumn(existing.id)
      } else {
        deps.deckStore.addColumn({
          type: 'timeline',
          accountId,
          tl: type as 'home' | 'local' | 'social' | 'global',
          name: null,
          width: 380,
        })
      }
    },

    notifications: () => {
      const accountId = deps.accountsStore.activeAccount?.id
      if (!accountId) return
      const existing = deps.deckStore.columns.find(
        (c) => c.type === 'notifications' && c.accountId === accountId,
      )
      if (existing) {
        deps.deckStore.setActiveColumn(existing.id)
      } else {
        deps.deckStore.addColumn({
          type: 'notifications',
          accountId,
          name: null,
          width: 380,
        })
      }
    },

    note: (args) => {
      const accountId = deps.accountsStore.activeAccount?.id
      if (!accountId || !args.trim()) return
      deps.navigateToNote(accountId, args.trim())
    },

    delete: async (args) => {
      const accountId = deps.accountsStore.activeAccount?.id
      if (!accountId || !args.trim()) return
      await invoke('api_delete_note', { accountId, noteId: args.trim() })
    },

    accounts: () => {
      deps.toggleAccountMenu()
    },
  }
}
