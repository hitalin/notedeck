import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { Shortcut } from '@/commands/registry'

export interface KeybindEntry {
  commandId: string
  shortcuts: Shortcut[]
}

/**
 * VSCode の keybindings.json と同じ思想:
 * デフォルトキーバインドを定義し、ユーザーが上書きできる。
 */
const DEFAULT_KEYBINDS: KeybindEntry[] = [
  {
    commandId: 'command-palette',
    shortcuts: [
      { key: 'k', ctrl: true, scope: 'global' },
      { key: '/', scope: 'body' },
      { key: '?', scope: 'body' },
    ],
  },
  {
    commandId: 'search',
    shortcuts: [
      { key: 'f', ctrl: true, shift: true, scope: 'global' },
      { key: 's', scope: 'body' },
    ],
  },
  {
    commandId: 'notifications',
    shortcuts: [{ key: 'i', scope: 'body' }],
  },
  {
    commandId: 'compose',
    shortcuts: [
      { key: 'p', scope: 'body' },
      { key: 'n', scope: 'body' },
      { key: 'n', ctrl: true, shift: true, scope: 'global' },
    ],
  },
  {
    commandId: 'add-column',
    shortcuts: [],
  },
  {
    commandId: 'toggle-sidebar',
    shortcuts: [],
  },
  {
    commandId: 'boss-key',
    shortcuts: [{ key: 'b', ctrl: true, shift: true, scope: 'global' }],
  },
  {
    commandId: 'account-menu',
    shortcuts: [{ key: 'a', scope: 'body' }],
  },
  {
    commandId: 'note-next',
    shortcuts: [{ key: 'j', scope: 'body' }],
  },
  {
    commandId: 'note-prev',
    shortcuts: [{ key: 'k', scope: 'body' }],
  },
  {
    commandId: 'note-reply',
    shortcuts: [{ key: 'r', scope: 'body' }],
  },
  {
    commandId: 'note-react',
    shortcuts: [
      { key: 'e', scope: 'body' },
      { key: '+', scope: 'body' },
    ],
  },
  {
    commandId: 'note-renote',
    shortcuts: [{ key: 'q', scope: 'body' }],
  },
  {
    commandId: 'note-bookmark',
    shortcuts: [{ key: 'b', scope: 'body' }],
  },
  {
    commandId: 'note-open',
    shortcuts: [{ key: 'Enter', scope: 'body' }],
  },
  {
    commandId: 'note-cw',
    shortcuts: [{ key: 'v', scope: 'body' }],
  },
  {
    commandId: 'column-next',
    shortcuts: [{ key: 'l', shift: true, scope: 'body' }],
  },
  {
    commandId: 'column-prev',
    shortcuts: [{ key: 'h', shift: true, scope: 'body' }],
  },
  {
    commandId: 'column-1',
    shortcuts: [{ key: '1', ctrl: true, scope: 'global' }],
  },
  {
    commandId: 'column-2',
    shortcuts: [{ key: '2', ctrl: true, scope: 'global' }],
  },
  {
    commandId: 'column-3',
    shortcuts: [{ key: '3', ctrl: true, scope: 'global' }],
  },
  {
    commandId: 'column-4',
    shortcuts: [{ key: '4', ctrl: true, scope: 'global' }],
  },
  {
    commandId: 'column-5',
    shortcuts: [{ key: '5', ctrl: true, scope: 'global' }],
  },
  {
    commandId: 'column-6',
    shortcuts: [{ key: '6', ctrl: true, scope: 'global' }],
  },
  {
    commandId: 'column-7',
    shortcuts: [{ key: '7', ctrl: true, scope: 'global' }],
  },
  {
    commandId: 'column-8',
    shortcuts: [{ key: '8', ctrl: true, scope: 'global' }],
  },
  {
    commandId: 'column-9',
    shortcuts: [{ key: '9', ctrl: true, scope: 'global' }],
  },
  {
    commandId: 'quick-react-1',
    shortcuts: [{ key: '1', scope: 'body' }],
  },
  {
    commandId: 'quick-react-2',
    shortcuts: [{ key: '2', scope: 'body' }],
  },
  {
    commandId: 'quick-react-3',
    shortcuts: [{ key: '3', scope: 'body' }],
  },
  {
    commandId: 'quick-react-4',
    shortcuts: [{ key: '4', scope: 'body' }],
  },
  {
    commandId: 'quick-react-5',
    shortcuts: [{ key: '5', scope: 'body' }],
  },
  {
    commandId: 'quick-react-6',
    shortcuts: [{ key: '6', scope: 'body' }],
  },
  {
    commandId: 'quick-react-7',
    shortcuts: [{ key: '7', scope: 'body' }],
  },
  {
    commandId: 'quick-react-8',
    shortcuts: [{ key: '8', scope: 'body' }],
  },
  {
    commandId: 'quick-react-9',
    shortcuts: [{ key: '9', scope: 'body' }],
  },
]

const STORAGE_KEY = 'nd-keybinds'

export const useKeybindsStore = defineStore('keybinds', () => {
  // ユーザーカスタマイズ: commandId → shortcuts の上書き
  // null = デフォルトを使用、空配列 = キーバインドを無効化
  const overrides = ref<Record<string, Shortcut[]>>(loadOverrides())

  function loadOverrides(): Record<string, Shortcut[]> {
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (raw) return JSON.parse(raw) as Record<string, Shortcut[]>
    } catch {
      // ignore
    }
    return {}
  }

  function saveOverrides() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(overrides.value))
  }

  function getShortcuts(commandId: string): Shortcut[] {
    if (commandId in overrides.value) {
      return overrides.value[commandId] ?? []
    }
    const entry = DEFAULT_KEYBINDS.find((e) => e.commandId === commandId)
    return entry?.shortcuts ?? []
  }

  function getDefaultShortcuts(commandId: string): Shortcut[] {
    const entry = DEFAULT_KEYBINDS.find((e) => e.commandId === commandId)
    return entry?.shortcuts ?? []
  }

  function setShortcuts(commandId: string, shortcuts: Shortcut[]) {
    overrides.value[commandId] = shortcuts
    saveOverrides()
  }

  function resetToDefault(commandId: string) {
    delete overrides.value[commandId]
    saveOverrides()
  }

  function resetAll() {
    overrides.value = {}
    saveOverrides()
  }

  function isCustomized(commandId: string): boolean {
    return commandId in overrides.value
  }

  function getAllCommandIds(): string[] {
    return DEFAULT_KEYBINDS.map((e) => e.commandId)
  }

  return {
    overrides,
    getShortcuts,
    getDefaultShortcuts,
    setShortcuts,
    resetToDefault,
    resetAll,
    isCustomized,
    getAllCommandIds,
  }
})
