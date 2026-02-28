import { defineStore } from 'pinia'
import { ref } from 'vue'

export interface Shortcut {
  /** KeyboardEvent.key の値 ('k', 'p', 'Escape' 等) */
  key: string
  ctrl?: boolean
  shift?: boolean
  alt?: boolean
  /**
   * 'global' - 修飾キー付き、常に有効 (Ctrl+K 等)
   * 'body' - テキスト入力中は無効 (単キー: p, n 等)
   */
  scope: 'global' | 'body'
}

export interface Command {
  id: string
  label: string
  /** Tabler icon 名 ('pencil', 'search' 等) */
  icon: string
  category: 'general' | 'navigation' | 'column' | 'account'
  shortcuts: Shortcut[]
  execute: () => void
  /** false を返すとパレットでグレー表示＋実行不可 */
  enabled?: () => boolean
  /** false にするとパレットに非表示 (ショートカットのみ) */
  visible?: boolean
}

export const useCommandStore = defineStore('commands', () => {
  const commands = ref(new Map<string, Command>())
  const isOpen = ref(false)

  function register(command: Command) {
    commands.value.set(command.id, command)
  }

  function unregister(id: string) {
    commands.value.delete(id)
  }

  function getEnabled(): Command[] {
    return [...commands.value.values()].filter(
      (cmd) => cmd.enabled?.() !== false,
    )
  }

  function execute(id: string) {
    const cmd = commands.value.get(id)
    if (cmd && cmd.enabled?.() !== false) {
      cmd.execute()
    }
  }

  function open() {
    isOpen.value = true
  }

  function close() {
    isOpen.value = false
  }

  function toggle() {
    isOpen.value = !isOpen.value
  }

  return {
    commands,
    isOpen,
    register,
    unregister,
    getEnabled,
    execute,
    open,
    close,
    toggle,
  }
})
