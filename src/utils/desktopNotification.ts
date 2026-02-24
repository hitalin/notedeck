import {
  isPermissionGranted,
  requestPermission,
  sendNotification,
} from '@tauri-apps/plugin-notification'

let granted = false

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
  return granted
}

export function sendDesktopNotification(title: string, body: string): void {
  if (!granted) return
  sendNotification({ title, body })
}
