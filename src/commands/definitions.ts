import { useCommandStore } from '@/commands/registry'
import type { NoteAction } from '@/composables/useNoteFocus'

export interface CommandHandlers {
  openCompose: () => void
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
    shortcuts: [{ key: 'a', scope: 'body' }],
    execute: handlers.toggleAccountMenu,
  })

  // Note-level shortcuts (dispatched as CustomEvents to active column)
  commandStore.register({
    id: 'note-next',
    label: 'Next Note',
    icon: 'arrow-down',
    category: 'general',
    shortcuts: [{ key: 'j', scope: 'body' }],
    execute: () => dispatchNoteAction('next'),
    visible: false,
  })

  commandStore.register({
    id: 'note-prev',
    label: 'Previous Note',
    icon: 'arrow-up',
    category: 'general',
    shortcuts: [{ key: 'k', scope: 'body' }],
    execute: () => dispatchNoteAction('prev'),
    visible: false,
  })

  commandStore.register({
    id: 'note-reply',
    label: 'Reply',
    icon: 'arrow-back-up',
    category: 'general',
    shortcuts: [{ key: 'r', scope: 'body' }],
    execute: () => dispatchNoteAction('reply'),
    visible: false,
  })

  commandStore.register({
    id: 'note-react',
    label: 'React',
    icon: 'mood-plus',
    category: 'general',
    shortcuts: [
      { key: 'e', scope: 'body' },
      { key: '+', scope: 'body' },
    ],
    execute: () => dispatchNoteAction('react'),
    visible: false,
  })

  commandStore.register({
    id: 'note-renote',
    label: 'Renote / Quote',
    icon: 'repeat',
    category: 'general',
    shortcuts: [{ key: 'q', scope: 'body' }],
    execute: () => dispatchNoteAction('renote'),
    visible: false,
  })

  commandStore.register({
    id: 'note-bookmark',
    label: 'Bookmark',
    icon: 'star',
    category: 'general',
    shortcuts: [{ key: 'b', scope: 'body' }],
    execute: () => dispatchNoteAction('bookmark'),
    visible: false,
  })

  commandStore.register({
    id: 'note-open',
    label: 'Open Note',
    icon: 'external-link',
    category: 'general',
    shortcuts: [{ key: 'Enter', scope: 'body' }],
    execute: () => dispatchNoteAction('open'),
    visible: false,
  })

  commandStore.register({
    id: 'note-cw',
    label: 'Toggle CW',
    icon: 'eye',
    category: 'general',
    shortcuts: [{ key: 'v', scope: 'body' }],
    execute: () => dispatchNoteAction('toggle-cw'),
    visible: false,
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
    ...NOTE_COMMAND_IDS,
  ]) {
    commandStore.unregister(id)
  }
}
