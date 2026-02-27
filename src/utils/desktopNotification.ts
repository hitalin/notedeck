import {
  isPermissionGranted,
  onAction,
  requestPermission,
  sendNotification,
} from '@tauri-apps/plugin-notification'

export type NotificationContext = {
  noteId?: string
  userId?: string
  accountId: string
}

let granted = false
const pendingContexts = new Map<number, NotificationContext>()
let nextId = 1
let actionHandler: ((ctx: NotificationContext) => void) | null = null

export function onNotificationAction(
  handler: (ctx: NotificationContext) => void,
) {
  actionHandler = handler
}

export async function initDesktopNotifications(): Promise<boolean> {
  try {
    granted = await isPermissionGranted()
    if (!granted) {
      const result = await requestPermission()
      granted = result === 'granted'
    }
  } catch {
    // Not running in Tauri (e.g. vitest)
    granted = false
  }

  try {
    await onAction((notification) => {
      const id = notification.id
      if (id == null) return
      const ctx = pendingContexts.get(id)
      if (ctx && actionHandler) {
        actionHandler(ctx)
        pendingContexts.delete(id)
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
  if (!granted) return
  if (document.hasFocus()) return

  if (context) {
    const id = nextId++
    pendingContexts.set(id, context)
    sendNotification({ id, title, body })
    setTimeout(() => pendingContexts.delete(id), 300_000)
  } else {
    sendNotification({ title, body })
  }
}
