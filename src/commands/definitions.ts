import { useCommandStore } from '@/commands/registry'

export interface CommandHandlers {
  openCompose: () => void
  toggleAddMenu: () => void
  toggleNav: () => void
  toggleAccountMenu: () => void
}

export function registerDefaultCommands(handlers: CommandHandlers) {
  const commandStore = useCommandStore()

  commandStore.register({
    id: 'command-palette',
    label: 'Command Palette',
    icon: 'search',
    category: 'general',
    shortcuts: [
      { key: 'k', ctrl: true, scope: 'global' },
      { key: '/', scope: 'body' },
      { key: '?', scope: 'body' },
    ],
    execute: () => commandStore.toggle(),
    visible: false,
  })

  commandStore.register({
    id: 'compose',
    label: 'New Note',
    icon: 'pencil',
    category: 'general',
    shortcuts: [
      { key: 'p', scope: 'body' },
      { key: 'n', scope: 'body' },
      { key: 'n', ctrl: true, shift: true, scope: 'global' },
    ],
    execute: handlers.openCompose,
  })

  commandStore.register({
    id: 'add-column',
    label: 'Add Column',
    icon: 'plus',
    category: 'column',
    shortcuts: [],
    execute: handlers.toggleAddMenu,
  })

  commandStore.register({
    id: 'toggle-sidebar',
    label: 'Toggle Sidebar',
    icon: 'layout-sidebar-left-collapse',
    category: 'navigation',
    shortcuts: [],
    execute: handlers.toggleNav,
  })

  commandStore.register({
    id: 'account-menu',
    label: 'Account Menu',
    icon: 'user',
    category: 'account',
    shortcuts: [
      { key: 'a', scope: 'body' },
    ],
    execute: handlers.toggleAccountMenu,
  })
}

export function unregisterDefaultCommands() {
  const commandStore = useCommandStore()
  for (const id of [
    'command-palette',
    'compose',
    'add-column',
    'toggle-sidebar',
    'account-menu',
  ]) {
    commandStore.unregister(id)
  }
}
