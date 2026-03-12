import { getCurrentWindow } from '@tauri-apps/api/window'
import { useCommandStore } from '@/commands/registry'
import type { NoteAction } from '@/composables/useNoteFocus'
import { useDeckStore } from '@/stores/deck'
import { useKeybindsStore } from '@/stores/keybinds'
import { useThemeStore } from '@/stores/theme'
import { useUiStore } from '@/stores/ui'

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
    label: 'コマンドパレット',
    icon: 'search',
    category: 'general',
    shortcuts: keybindsStore.getShortcuts('command-palette'),
    execute: () => commandStore.toggle(),
    visible: false,
  })

  commandStore.register({
    id: 'search',
    label: '検索',
    icon: 'search',
    category: 'navigation',
    shortcuts: keybindsStore.getShortcuts('search'),
    execute: handlers.openSearch,
  })

  commandStore.register({
    id: 'notifications',
    label: '通知',
    icon: 'bell',
    category: 'navigation',
    shortcuts: keybindsStore.getShortcuts('notifications'),
    execute: handlers.openNotifications,
  })

  commandStore.register({
    id: 'compose',
    label: 'ノート作成',
    icon: 'pencil',
    category: 'general',
    shortcuts: keybindsStore.getShortcuts('compose'),
    execute: handlers.openCompose,
  })

  commandStore.register({
    id: 'add-column',
    label: 'カラム追加',
    icon: 'plus',
    category: 'column',
    shortcuts: keybindsStore.getShortcuts('add-column'),
    execute: handlers.toggleAddMenu,
  })

  commandStore.register({
    id: 'toggle-sidebar',
    label: 'サイドバー切替',
    icon: 'layout-sidebar-left-collapse',
    category: 'navigation',
    shortcuts: keybindsStore.getShortcuts('toggle-sidebar'),
    execute: handlers.toggleNav,
  })

  if (useUiStore().isDesktop) {
    commandStore.register({
      id: 'boss-key',
      label: 'ウィンドウを隠す',
      icon: 'eye-off',
      category: 'general',
      shortcuts: keybindsStore.getShortcuts('boss-key'),
      execute: () => getCurrentWindow().hide(),
    })
  }

  commandStore.register({
    id: 'account-menu',
    label: 'アカウントメニュー',
    icon: 'user',
    category: 'account',
    shortcuts: keybindsStore.getShortcuts('account-menu'),
    execute: handlers.toggleAccountMenu,
  })

  commandStore.register({
    id: 'toggle-dark-mode',
    label: 'ダーク/ライトモード切替',
    icon: 'sun-moon',
    category: 'general',
    shortcuts: keybindsStore.getShortcuts('toggle-dark-mode'),
    execute: () => useThemeStore().toggleTheme(),
  })

  // Note-level shortcuts (dispatched as CustomEvents to active column)
  commandStore.register({
    id: 'note-next',
    label: '次のノート',
    icon: 'arrow-down',
    category: 'note',
    shortcuts: keybindsStore.getShortcuts('note-next'),
    execute: () => dispatchNoteAction('next'),
  })

  commandStore.register({
    id: 'note-prev',
    label: '前のノート',
    icon: 'arrow-up',
    category: 'note',
    shortcuts: keybindsStore.getShortcuts('note-prev'),
    execute: () => dispatchNoteAction('prev'),
  })

  commandStore.register({
    id: 'note-reply',
    label: '返信',
    icon: 'arrow-back-up',
    category: 'note',
    shortcuts: keybindsStore.getShortcuts('note-reply'),
    execute: () => dispatchNoteAction('reply'),
  })

  commandStore.register({
    id: 'note-react',
    label: 'リアクション',
    icon: 'mood-plus',
    category: 'note',
    shortcuts: keybindsStore.getShortcuts('note-react'),
    execute: () => dispatchNoteAction('react'),
  })

  commandStore.register({
    id: 'note-renote',
    label: 'リノート / 引用',
    icon: 'repeat',
    category: 'note',
    shortcuts: keybindsStore.getShortcuts('note-renote'),
    execute: () => dispatchNoteAction('renote'),
  })

  commandStore.register({
    id: 'note-bookmark',
    label: 'ブックマーク',
    icon: 'star',
    category: 'note',
    shortcuts: keybindsStore.getShortcuts('note-bookmark'),
    execute: () => dispatchNoteAction('bookmark'),
  })

  commandStore.register({
    id: 'note-open',
    label: 'ノートを開く',
    icon: 'external-link',
    category: 'note',
    shortcuts: keybindsStore.getShortcuts('note-open'),
    execute: () => dispatchNoteAction('open'),
  })

  commandStore.register({
    id: 'note-cw',
    label: 'CW切替',
    icon: 'eye',
    category: 'note',
    shortcuts: keybindsStore.getShortcuts('note-cw'),
    execute: () => dispatchNoteAction('toggle-cw'),
  })

  // Column navigation
  const deckStore = useDeckStore()

  commandStore.register({
    id: 'column-next',
    label: '次のカラム',
    icon: 'arrow-right',
    category: 'column',
    shortcuts: keybindsStore.getShortcuts('column-next'),
    execute: () => deckStore.focusNextColumn(),
  })

  commandStore.register({
    id: 'column-prev',
    label: '前のカラム',
    icon: 'arrow-left',
    category: 'column',
    shortcuts: keybindsStore.getShortcuts('column-prev'),
    execute: () => deckStore.focusPrevColumn(),
  })

  for (let i = 1; i <= 9; i++) {
    commandStore.register({
      id: `column-${i}`,
      label: `カラム ${i} に移動`,
      icon: 'columns',
      category: 'column',
      shortcuts: keybindsStore.getShortcuts(`column-${i}`),
      execute: () => deckStore.focusColumnByIndex(i - 1),
    })
  }

  // Quick reactions (1-9 keys send pinned reactions to focused note)
  for (let i = 1; i <= 9; i++) {
    commandStore.register({
      id: `quick-react-${i}`,
      label: `クイックリアクション ${i}`,
      icon: 'mood-plus',
      category: 'note',
      shortcuts: keybindsStore.getShortcuts(`quick-react-${i}`),
      execute: () => dispatchNoteAction(`quick-react-${i}` as NoteAction),
    })
  }

  commandStore.register({
    id: 'profile-new',
    label: '新しいプロファイルを作成',
    icon: 'plus',
    category: 'general',
    shortcuts: [],
    execute: () => {
      const deckStore = useDeckStore()
      deckStore.saveAsProfile()
      refreshProfileCommands()
    },
  })

  // Profile switching (Alt+1-9 to switch deck profiles)
  refreshProfileCommands()
}

export function refreshProfileCommands() {
  const commandStore = useCommandStore()
  const keybindsStore = useKeybindsStore()
  const deckStore = useDeckStore()

  // Unregister existing profile commands
  for (const id of PROFILE_IDS) {
    commandStore.unregister(id)
  }

  // Register commands for current profiles
  const profiles = deckStore.getProfiles()
  for (let i = 1; i <= Math.min(profiles.length, 9); i++) {
    const profile = profiles[i - 1]
    if (!profile) continue
    const profileId = profile.id
    const profileName = profile.name
    commandStore.register({
      id: `profile-${i}`,
      label: `${profileName} に切替`,
      icon: 'layout',
      category: 'general',
      shortcuts: keybindsStore.getShortcuts(`profile-${i}`),
      execute: () => deckStore.applyProfile(profileId),
    })
  }
}

const COLUMN_COMMAND_IDS = [
  'column-next',
  'column-prev',
  ...Array.from({ length: 9 }, (_, i) => `column-${i + 1}`),
] as const

const QUICK_REACT_IDS = Array.from(
  { length: 9 },
  (_, i) => `quick-react-${i + 1}`,
) as readonly string[]

const PROFILE_IDS = Array.from(
  { length: 9 },
  (_, i) => `profile-${i + 1}`,
) as readonly string[]

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
    'toggle-dark-mode',
    'profile-new',
    ...NOTE_COMMAND_IDS,
    ...COLUMN_COMMAND_IDS,
    ...QUICK_REACT_IDS,
    ...PROFILE_IDS,
  ]) {
    commandStore.unregister(id)
  }
}
