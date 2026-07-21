export type NotificationContext = {
  noteId?: string
  userId?: string
  accountId: string
}

let granted = false
const pendingContexts = new Map<number, NotificationContext>()
let nextId = 1
let actionHandler: ((ctx: NotificationContext) => void) | null = null
let notificationModule:
  | typeof import('@tauri-apps/plugin-notification')
  | null = null

async function loadModule() {
  if (!notificationModule) {
    notificationModule = await import('@tauri-apps/plugin-notification')
  }
  return notificationModule
}

export function onNotificationAction(
  handler: (ctx: NotificationContext) => void,
) {
  actionHandler = handler
}

/** Rust 経路の通知 (Android) が extra に積んだ遷移コンテキストを復元する */
function contextFromExtra(
  extra: Record<string, unknown> | undefined,
): NotificationContext | null {
  if (typeof extra?.accountId !== 'string') return null
  return {
    accountId: extra.accountId,
    noteId: typeof extra.noteId === 'string' ? extra.noteId : undefined,
    userId: typeof extra.userId === 'string' ? extra.userId : undefined,
  }
}

export async function initDesktopNotifications(): Promise<boolean> {
  try {
    const mod = await loadModule()
    granted = await mod.isPermissionGranted()
    if (!granted) {
      const result = await mod.requestPermission()
      granted = result === 'granted'
    }
  } catch {
    // Not running in Tauri (e.g. vitest)
    granted = false
  }

  try {
    const mod = await loadModule()
    await mod.onAction((notification) => {
      const id = notification.id
      const pending = id == null ? undefined : pendingContexts.get(id)
      // Rust 経路 (Android streaming) は extra にコンテキストを積んでくる (#754)
      const ctx = pending ?? contextFromExtra(notification.extra)
      if (ctx && actionHandler) {
        actionHandler(ctx)
        if (id != null) pendingContexts.delete(id)
      }
    })
  } catch {
    // Non-Tauri environment
  }

  return granted
}

export function sendDesktopNotification(
  title: string,
  body: string,
  context?: NotificationContext,
): void {
  if (!granted || !notificationModule) return
  if (document.hasFocus()) return

  if (context) {
    const id = nextId++
    pendingContexts.set(id, context)
    notificationModule.sendNotification({ id, title, body })
    setTimeout(() => pendingContexts.delete(id), 300_000)
  } else {
    notificationModule.sendNotification({ title, body })
  }
}
