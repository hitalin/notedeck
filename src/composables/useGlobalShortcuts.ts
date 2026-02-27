import { onUnmounted } from 'vue'

export interface ShortcutHandlers {
  onCompose?: () => void
}

export function useGlobalShortcuts(handlers: ShortcutHandlers) {
  let registered = false

  async function init() {
    try {
      const { register } = await import('@tauri-apps/plugin-global-shortcut')
      if (handlers.onCompose) {
        const cb = handlers.onCompose
        await register('CmdOrCtrl+Shift+N', (event) => {
          if (event.state === 'Pressed') cb()
        })
      }
      registered = true
    } catch {
      // Not running in Tauri or plugin not available
    }
  }

  async function cleanup() {
    if (!registered) return
    try {
      const { unregisterAll } = await import(
        '@tauri-apps/plugin-global-shortcut'
      )
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
