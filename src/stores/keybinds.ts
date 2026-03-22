import JSON5 from 'json5'
import { defineStore } from 'pinia'
import { ref } from 'vue'

import type { Shortcut } from '@/commands/registry'
import defaultKeybindsJson5 from '@/defaults/keybindings.json5?raw'
import { readKeybinds, writeKeybinds } from '@/utils/settingsFs'
import { getStorageJson, STORAGE_KEYS, setStorageJson } from '@/utils/storage'

export interface KeybindEntry {
  commandId: string
  shortcuts: Shortcut[]
}

const DEFAULT_KEYBINDS: KeybindEntry[] = JSON5.parse(defaultKeybindsJson5)

const isTauri = '__TAURI_INTERNALS__' in window || '__TAURI__' in window

export const useKeybindsStore = defineStore('keybinds', () => {
  // ユーザーカスタマイズ: commandId → shortcuts の上書き
  // null = デフォルトを使用、空配列 = キーバインドを無効化
  const overrides = ref<Record<string, Shortcut[]>>(
    getStorageJson<Record<string, Shortcut[]>>(STORAGE_KEYS.keybinds, {}),
  )
  const initialized = ref(false)

  function saveOverrides() {
    setStorageJson(STORAGE_KEYS.keybinds, overrides.value)
    if (initialized.value) {
      persistToFile().catch((e) =>
        console.warn('[keybinds] failed to persist to file:', e),
      )
    }
  }

  /** Write overrides to keybinds.json5 file. */
  async function persistToFile(): Promise<void> {
    const content = JSON5.stringify(overrides.value, null, 2)
    await writeKeybinds(content)
  }

  /** Load from file and initialize. Files are source of truth. */
  async function initFileStorage(): Promise<void> {
    const content = await readKeybinds()
    if (content) {
      try {
        const parsed = JSON5.parse(content) as Record<string, Shortcut[]>
        overrides.value = parsed
        setStorageJson(STORAGE_KEYS.keybinds, parsed)
      } catch (e) {
        console.warn('[keybinds] failed to parse keybinds.json5:', e)
      }
    }
    initialized.value = true
    // Migrate: localStorage has overrides but no file exists
    if (!content && Object.keys(overrides.value).length > 0) {
      persistToFile().catch((e) =>
        console.warn('[keybinds] migration to file failed:', e),
      )
    }
  }

  /** Initialize file-based storage (call once at startup). */
  function init(): void {
    if (isTauri) {
      initFileStorage().catch((e) =>
        console.warn('[keybinds] file storage init failed:', e),
      )
    } else {
      initialized.value = true
    }
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
    init,
    getShortcuts,
    getDefaultShortcuts,
    setShortcuts,
    resetToDefault,
    resetAll,
    isCustomized,
    getAllCommandIds,
  }
})
