import { listen } from '@tauri-apps/api/event'
import { WebviewWindow } from '@tauri-apps/api/webviewWindow'
import type { TimelineType } from '@/adapters/types'

const PIP_LABEL = 'pip'
const PIP_WIDTH = 360
const PIP_HEIGHT = 420

let pipWindow: WebviewWindow | null = null
let unlistenFn: (() => void) | null = null

export async function openPipWindow(
  accountId: string,
  timeline: TimelineType = 'home',
): Promise<void> {
  // If PiP already exists, focus it
  if (pipWindow) {
    try {
      await pipWindow.setFocus()
      return
    } catch {
      // Window might have been closed externally
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

  win.once('tauri://error', () => {
    pipWindow = null
  })

  pipWindow = win

  // Clean up reference when window is closed
  win.once('tauri://destroyed', () => {
    pipWindow = null
    unlistenFn?.()
    unlistenFn = null
  })
}

export async function closePipWindow(): Promise<void> {
  if (pipWindow) {
    try {
      await pipWindow.close()
    } catch {
      // Already closed
    }
    pipWindow = null
  }
}

export function isPipOpen(): boolean {
  return pipWindow !== null
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
