import { onUnmounted } from 'vue'
import {
  register,
  unregisterAll,
} from '@tauri-apps/plugin-global-shortcut'

export interface ShortcutHandlers {
  onCompose?: () => void
}

export function useGlobalShortcuts(handlers: ShortcutHandlers) {
  let registered = false

  async function init() {
    try {
      if (handlers.onCompose) {
        const cb = handlers.onCompose
        await register('CmdOrCtrl+Shift+N', (event) => {
          if (event.state === 'Pressed') cb()
        })
      }
      registered = true
    } catch {
      // Not running in Tauri
    }
  }

  async function cleanup() {
    if (!registered) return
    try {
      await unregisterAll()
    } catch {
      // ignore
    }
  }

  onUnmounted(() => {
    cleanup()
  })

  return { init, cleanup }
}
