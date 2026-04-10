import JSON5 from 'json5'
import { defineStore } from 'pinia'
import { computed, ref } from 'vue'

import type { Shortcut } from '@/commands/registry'
import defaultKeybindsJson5 from '@/defaults/keybindings.json5?raw'
import { useSettingsStore } from '@/stores/settings'
import { isTauri, readKeybinds } from '@/utils/settingsFs'

export interface KeybindEntry {
  commandId: string
  shortcuts: Shortcut[]
}

const DEFAULT_KEYBINDS: KeybindEntry[] = JSON5.parse(defaultKeybindsJson5)

export const useKeybindsStore = defineStore('keybinds', () => {
  const settingsStore = useSettingsStore()

  // settingsStore が single source of truth。
  // overrides は computed で settingsStore.get('keybinds') を読む。
  const overrides = computed<Record<string, Shortcut[]>>({
    get: () => settingsStore.get('keybinds') ?? {},
    set: (v) => settingsStore.set('keybinds', v),
  })
  const initialized = ref(false)

  /**
   * Legacy migration: read keybinds.json5 once and seed settingsStore
   * if it doesn't already have keybinds (first run after migration).
   */
  async function initFileStorage(): Promise<void> {
    if (!settingsStore.get('keybinds')) {
      const content = await readKeybinds()
      if (content) {
        try {
          const parsed = JSON5.parse(content) as Record<string, Shortcut[]>
          settingsStore.set('keybinds', parsed)
        } catch (e) {
          console.warn('[keybinds] failed to parse keybinds.json5:', e)
        }
      }
    }
    initialized.value = true
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
    // WritableComputed setter → settingsStore.set() → settings.json persist
    overrides.value = { ...overrides.value, [commandId]: shortcuts }
  }

  function resetToDefault(commandId: string) {
    const { [commandId]: _, ...rest } = overrides.value
    overrides.value = rest
  }

  function resetAll() {
    overrides.value = {}
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
