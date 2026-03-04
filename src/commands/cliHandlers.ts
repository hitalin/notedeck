import { invoke } from '@tauri-apps/api/core'
import type { useAccountsStore } from '@/stores/accounts'
import type { useDeckStore } from '@/stores/deck'

export interface CliHandlerDeps {
  deckStore: ReturnType<typeof useDeckStore>
  accountsStore: ReturnType<typeof useAccountsStore>
  navigateToNote: (accountId: string, noteId: string) => void
  navigateToUser: (accountId: string, userId: string) => void
  toggleAccountMenu: () => void
}

export type CliHandler = (args: string) => void | Promise<void>

export function createCliHandlers(
  deps: CliHandlerDeps,
): Record<string, CliHandler> {
  function activeAccountId(): string | undefined {
    return deps.accountsStore.activeAccount?.id
  }

  return {
    post: async (args) => {
      const accountId = activeAccountId()
      if (!accountId || !args.trim()) return
      await invoke('api_create_note', {
        accountId,
        text: args.trim(),
        visibility: 'public',
      })
    },

    search: (args) => {
      const accountId = activeAccountId()
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
      const accountId = activeAccountId()
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
      const accountId = activeAccountId()
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

    mentions: () => {
      const accountId = activeAccountId()
      if (!accountId) return
      const existing = deps.deckStore.columns.find(
        (c) => c.type === 'mentions' && c.accountId === accountId,
      )
      if (existing) {
        deps.deckStore.setActiveColumn(existing.id)
      } else {
        deps.deckStore.addColumn({
          type: 'mentions',
          accountId,
          name: null,
          width: 380,
        })
      }
    },

    favorites: () => {
      const accountId = activeAccountId()
      if (!accountId) return
      const existing = deps.deckStore.columns.find(
        (c) => c.type === 'favorites' && c.accountId === accountId,
      )
      if (existing) {
        deps.deckStore.setActiveColumn(existing.id)
      } else {
        deps.deckStore.addColumn({
          type: 'favorites',
          accountId,
          name: null,
          width: 380,
        })
      }
    },

    note: (args) => {
      const accountId = activeAccountId()
      if (!accountId || !args.trim()) return
      deps.navigateToNote(accountId, args.trim())
    },

    replies: (args) => {
      const accountId = activeAccountId()
      if (!accountId || !args.trim()) return
      deps.navigateToNote(accountId, args.trim())
    },

    thread: (args) => {
      const accountId = activeAccountId()
      if (!accountId || !args.trim()) return
      deps.navigateToNote(accountId, args.trim())
    },

    delete: async (args) => {
      const accountId = activeAccountId()
      if (!accountId || !args.trim()) return
      await invoke('api_delete_note', { accountId, noteId: args.trim() })
    },

    update: async (args) => {
      const accountId = activeAccountId()
      if (!accountId) return
      // Format: update <id> <text>
      const spaceIdx = args.trim().indexOf(' ')
      if (spaceIdx === -1) return
      const noteId = args.trim().slice(0, spaceIdx)
      const text = args.trim().slice(spaceIdx + 1)
      if (!noteId || !text) return
      await invoke('api_update_note', { accountId, noteId, text })
    },

    react: async (args) => {
      const accountId = activeAccountId()
      if (!accountId) return
      // Format: react <note_id> <reaction>
      const parts = args.trim().split(/\s+/)
      if (parts.length < 2) return
      const noteId = parts[0]
      const reaction = parts.slice(1).join(' ')
      await invoke('api_create_reaction', { accountId, noteId, reaction })
    },

    unreact: async (args) => {
      const accountId = activeAccountId()
      if (!accountId || !args.trim()) return
      await invoke('api_delete_reaction', { accountId, noteId: args.trim() })
    },

    renote: async (args) => {
      const accountId = activeAccountId()
      if (!accountId || !args.trim()) return
      await invoke('api_create_note', {
        accountId,
        text: null,
        visibility: 'public',
        renoteId: args.trim(),
      })
    },

    user: (args) => {
      const accountId = activeAccountId()
      if (!accountId || !args.trim()) return
      deps.navigateToUser(accountId, args.trim())
    },

    'user-notes': (args) => {
      const accountId = activeAccountId()
      if (!accountId || !args.trim()) return
      deps.deckStore.addColumn({
        type: 'user',
        accountId,
        userId: args.trim(),
        name: null,
        width: 380,
      })
    },

    follow: async (args) => {
      const accountId = activeAccountId()
      if (!accountId || !args.trim()) return
      await invoke('api_follow_user', { accountId, userId: args.trim() })
    },

    unfollow: async (args) => {
      const accountId = activeAccountId()
      if (!accountId || !args.trim()) return
      await invoke('api_unfollow_user', { accountId, userId: args.trim() })
    },

    favorite: async (args) => {
      const accountId = activeAccountId()
      if (!accountId || !args.trim()) return
      await invoke('api_create_favorite', { accountId, noteId: args.trim() })
    },

    unfavorite: async (args) => {
      const accountId = activeAccountId()
      if (!accountId || !args.trim()) return
      await invoke('api_delete_favorite', { accountId, noteId: args.trim() })
    },

    emojis: () => {
      // No dedicated emojis column type — could be added later
    },

    accounts: () => {
      deps.toggleAccountMenu()
    },
  }
}
