import { defineStore } from 'pinia'
import { ref, shallowRef, triggerRef } from 'vue'
import type { QuickPickStep } from './quickPick'

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
  category: 'general' | 'navigation' | 'column' | 'account' | 'note' | 'window'
  shortcuts: Shortcut[]
  execute: () => void
  /** false を返すとパレットでグレー表示＋実行不可 */
  enabled?: () => boolean
  /** false にするとパレットに非表示 (ショートカットのみ) */
  visible?: boolean
}

export const useCommandStore = defineStore('commands', () => {
  const commands = shallowRef(new Map<string, Command>())
  const isOpen = ref(false)
  const initialInput = ref<string | null>(null)
  /** When set, only commands matching this predicate are shown */
  const commandFilter = ref<((cmd: Command) => boolean) | null>(null)
  const quickPickStack = ref<QuickPickStep[]>([])
  /** Query text for the current Quick Pick step (reset on push/pop) */
  const quickPickQuery = ref('')

  function register(command: Command) {
    commands.value.set(command.id, command)
    triggerRef(commands)
  }

  function unregister(id: string) {
    commands.value.delete(id)
    triggerRef(commands)
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

  function openWithInput(text: string) {
    if (isOpen.value) {
      close()
      return
    }
    initialInput.value = text
    isOpen.value = true
  }

  function openWithFilter(filter: (cmd: Command) => boolean, input?: string) {
    commandFilter.value = filter
    initialInput.value = input ?? null
    isOpen.value = true
  }

  function close() {
    isOpen.value = false
    commandFilter.value = null
    clearQuickPick()
  }

  function pushQuickPick(step: QuickPickStep) {
    quickPickStack.value = [...quickPickStack.value, step]
    quickPickQuery.value = ''
  }

  function popQuickPick() {
    quickPickStack.value = quickPickStack.value.slice(0, -1)
    quickPickQuery.value = ''
  }

  function clearQuickPick() {
    quickPickStack.value = []
    quickPickQuery.value = ''
  }

  function toggle() {
    if (isOpen.value) {
      close()
    } else {
      open()
    }
  }

  return {
    commands,
    isOpen,
    initialInput,
    commandFilter,
    quickPickStack,
    quickPickQuery,
    register,
    unregister,
    getEnabled,
    execute,
    open,
    openWithInput,
    openWithFilter,
    close,
    toggle,
    pushQuickPick,
    popQuickPick,
    clearQuickPick,
  }
})
