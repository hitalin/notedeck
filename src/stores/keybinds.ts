import JSON5 from 'json5'
import { defineStore } from 'pinia'
import { ref, watch } from 'vue'

import type { Shortcut } from '@/commands/registry'
import defaultKeybindsJson5 from '@/defaults/keybindings.json5?raw'
import { useSettingsStore } from '@/stores/settings'
import { isTauri, readKeybinds, writeKeybinds } from '@/utils/settingsFs'

export interface KeybindEntry {
  commandId: string
  shortcuts: Shortcut[]
}

const DEFAULT_KEYBINDS: KeybindEntry[] = JSON5.parse(defaultKeybindsJson5)
const PERSIST_DEBOUNCE_MS = 300

export const useKeybindsStore = defineStore('keybinds', () => {
  const overrides = ref<Record<string, Shortcut[]>>({})
  const initialized = ref(false)

  let persistTimer: ReturnType<typeof setTimeout> | null = null

  function schedulePersist(): void {
    if (persistTimer != null) clearTimeout(persistTimer)
    persistTimer = setTimeout(() => {
      persistTimer = null
      persist().catch((e) => console.warn('[keybinds] persist failed:', e))
    }, PERSIST_DEBOUNCE_MS)
  }

  async function persist(): Promise<void> {
    if (!isTauri) return
    const content = JSON5.stringify(overrides.value, null, 2)
    await writeKeybinds(`${content}\n`)
  }

  watch(overrides, () => schedulePersist(), { deep: true })

  /**
   * Migration: keybinds.json5 → 独立ファイル化。
   * 1. keybinds.json5 を読む (既存ファイル or 旧ファイル)
   * 2. なければ settingsStore の keybinds キーからマイグレーション
   * 3. settingsStore から keybinds キーを削除
   */
  async function initFileStorage(): Promise<void> {
    const content = await readKeybinds()
    if (content) {
      try {
        overrides.value = JSON5.parse(content) as Record<string, Shortcut[]>
      } catch (e) {
        console.warn('[keybinds] failed to parse keybinds.json5:', e)
      }
    } else {
      // settingsStore からマイグレーション（旧 settings.json に keybinds キーがある場合）
      const settingsStore = useSettingsStore()
      const raw = settingsStore.settings as unknown as Record<string, unknown>
      const legacy = raw.keybinds as Record<string, Shortcut[]> | undefined
      if (legacy && Object.keys(legacy).length > 0) {
        overrides.value = legacy
        // settingsStore から keybinds キーを削除
        const { keybinds: _, ...rest } = raw
        settingsStore.replaceAll(
          rest as unknown as typeof settingsStore.settings,
        )
      }
    }
    initialized.value = true
  }

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
