import { listen } from '@tauri-apps/api/event'
import { WebviewWindow } from '@tauri-apps/api/webviewWindow'
import type { TimelineType } from '@/adapters/types'

const PIP_LABEL = 'pip'
const PIP_WIDTH = 360
const PIP_HEIGHT = 420

let pipWindow: WebviewWindow | null = null
let unlistenFn: (() => void) | null = null
let creating = false

async function getExistingPipWindow(): Promise<WebviewWindow | null> {
  return await WebviewWindow.getByLabel(PIP_LABEL)
}

export async function openPipWindow(
  accountId: string,
  timeline: TimelineType = 'home',
): Promise<void> {
  // Prevent double creation (guard before any await)
  if (creating) return
  creating = true

  try {
    // Check for existing window (including externally managed ones)
    const existing = pipWindow ?? (await getExistingPipWindow())
    if (existing) {
      try {
        await existing.setFocus()
        pipWindow = existing
        return
      } catch {
        pipWindow = null
      }
    }

    const url = `/pip?accountId=${encodeURIComponent(accountId)}&timeline=${encodeURIComponent(timeline)}`

    const win = new WebviewWindow(PIP_LABEL, {
      url,
      title: 'NoteDeck PiP',
      width: PIP_WIDTH,
      height: PIP_HEIGHT,
      decorations: false,
      alwaysOnTop: true,
      resizable: true,
      minimizable: false,
      maximizable: false,
      visible: true,
      dragDropEnabled: false,
    })

    // Wait for actual creation or error
    await new Promise<void>((resolve, reject) => {
      win.once('tauri://created', () => resolve())
      win.once('tauri://error', (e) => reject(new Error(String(e.payload))))
    })

    // Windows: constructor alwaysOnTop may not take effect; re-apply explicitly
    await win.setAlwaysOnTop(true)

    pipWindow = win

    // Clean up reference when window is closed
    win.once('tauri://destroyed', () => {
      pipWindow = null
      unlistenFn?.()
      unlistenFn = null
    })
  } catch {
    pipWindow = null
  } finally {
    creating = false
  }
}

export async function closePipWindow(): Promise<void> {
  const win = pipWindow ?? (await getExistingPipWindow())
  if (win) {
    try {
      await win.close()
    } catch {
      // Already closed
    }
    pipWindow = null
  }
}

export async function isPipOpen(): Promise<boolean> {
  if (pipWindow) return true
  return (await getExistingPipWindow()) !== null
}

/**
 * Listen for IPC events from PiP window (call from main window).
 * Returns cleanup function.
 */
export async function listenPipEvents(handlers: {
  onOpenNote?: (accountId: string, noteId: string) => void
}): Promise<() => void> {
  const unlisten = await listen<{ accountId: string; noteId: string }>(
    'pip:open-note',
    (event) => {
      handlers.onOpenNote?.(event.payload.accountId, event.payload.noteId)
    },
  )
  unlistenFn = unlisten
  return unlisten
}
