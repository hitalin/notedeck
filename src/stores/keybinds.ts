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
