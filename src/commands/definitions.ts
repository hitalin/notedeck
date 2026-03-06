import { getCurrentWindow } from '@tauri-apps/api/window'
import { useCommandStore } from '@/commands/registry'
import type { NoteAction } from '@/composables/useNoteFocus'
import { useKeybindsStore } from '@/stores/keybinds'

export interface CommandHandlers {
  openCompose: () => void
  openSearch: () => void
  openNotifications: () => void
  toggleAddMenu: () => void
  toggleNav: () => void
  toggleAccountMenu: () => void
}

function dispatchNoteAction(action: NoteAction) {
  document.dispatchEvent(
    new CustomEvent<NoteAction>('nd:note-action', { detail: action }),
  )
}

const NOTE_COMMAND_IDS = [
  'note-next',
  'note-prev',
  'note-reply',
  'note-react',
  'note-renote',
  'note-bookmark',
  'note-open',
  'note-cw',
] as const

export function registerDefaultCommands(handlers: CommandHandlers) {
  const commandStore = useCommandStore()
  const keybindsStore = useKeybindsStore()

  commandStore.register({
    id: 'command-palette',
    label: 'Command Palette',
    icon: 'search',
    category: 'general',
    shortcuts: keybindsStore.getShortcuts('command-palette'),
    execute: () => commandStore.toggle(),
    visible: false,
  })

  commandStore.register({
    id: 'search',
    label: 'Search',
    icon: 'search',
    category: 'navigation',
    shortcuts: keybindsStore.getShortcuts('search'),
    execute: handlers.openSearch,
  })

  commandStore.register({
    id: 'notifications',
    label: 'Notifications',
    icon: 'bell',
    category: 'navigation',
    shortcuts: keybindsStore.getShortcuts('notifications'),
    execute: handlers.openNotifications,
  })

  commandStore.register({
    id: 'compose',
    label: 'New Note',
    icon: 'pencil',
    category: 'general',
    shortcuts: keybindsStore.getShortcuts('compose'),
    execute: handlers.openCompose,
  })

  commandStore.register({
    id: 'add-column',
    label: 'Add Column',
    icon: 'plus',
    category: 'column',
    shortcuts: keybindsStore.getShortcuts('add-column'),
    execute: handlers.toggleAddMenu,
  })

  commandStore.register({
    id: 'toggle-sidebar',
    label: 'Toggle Sidebar',
    icon: 'layout-sidebar-left-collapse',
    category: 'navigation',
    shortcuts: keybindsStore.getShortcuts('toggle-sidebar'),
    execute: handlers.toggleNav,
  })

  commandStore.register({
    id: 'boss-key',
    label: 'Hide Window',
    icon: 'eye-off',
    category: 'general',
    shortcuts: keybindsStore.getShortcuts('boss-key'),
    execute: () => getCurrentWindow().hide(),
  })

  commandStore.register({
    id: 'account-menu',
    label: 'Account Menu',
    icon: 'user',
    category: 'account',
    shortcuts: keybindsStore.getShortcuts('account-menu'),
    execute: handlers.toggleAccountMenu,
  })

  // Note-level shortcuts (dispatched as CustomEvents to active column)
  commandStore.register({
    id: 'note-next',
    label: 'Next Note',
    icon: 'arrow-down',
    category: 'note',
    shortcuts: keybindsStore.getShortcuts('note-next'),
    execute: () => dispatchNoteAction('next'),
  })

  commandStore.register({
    id: 'note-prev',
    label: 'Previous Note',
    icon: 'arrow-up',
    category: 'note',
    shortcuts: keybindsStore.getShortcuts('note-prev'),
    execute: () => dispatchNoteAction('prev'),
  })

  commandStore.register({
    id: 'note-reply',
    label: 'Reply',
    icon: 'arrow-back-up',
    category: 'note',
    shortcuts: keybindsStore.getShortcuts('note-reply'),
    execute: () => dispatchNoteAction('reply'),
  })

  commandStore.register({
    id: 'note-react',
    label: 'React',
    icon: 'mood-plus',
    category: 'note',
    shortcuts: keybindsStore.getShortcuts('note-react'),
    execute: () => dispatchNoteAction('react'),
  })

  commandStore.register({
    id: 'note-renote',
    label: 'Renote / Quote',
    icon: 'repeat',
    category: 'note',
    shortcuts: keybindsStore.getShortcuts('note-renote'),
    execute: () => dispatchNoteAction('renote'),
  })

  commandStore.register({
    id: 'note-bookmark',
    label: 'Bookmark',
    icon: 'star',
    category: 'note',
    shortcuts: keybindsStore.getShortcuts('note-bookmark'),
    execute: () => dispatchNoteAction('bookmark'),
  })

  commandStore.register({
    id: 'note-open',
    label: 'Open Note',
    icon: 'external-link',
    category: 'note',
    shortcuts: keybindsStore.getShortcuts('note-open'),
    execute: () => dispatchNoteAction('open'),
  })

  commandStore.register({
    id: 'note-cw',
    label: 'Toggle CW',
    icon: 'eye',
    category: 'note',
    shortcuts: keybindsStore.getShortcuts('note-cw'),
    execute: () => dispatchNoteAction('toggle-cw'),
  })
}

export function unregisterDefaultCommands() {
  const commandStore = useCommandStore()
  for (const id of [
    'command-palette',
    'search',
    'notifications',
    'compose',
    'boss-key',
    'add-column',
    'toggle-sidebar',
    'account-menu',
    ...NOTE_COMMAND_IDS,
  ]) {
    commandStore.unregister(id)
  }
}
