import { listen } from '@tauri-apps/api/event'
import { WebviewWindow } from '@tauri-apps/api/webviewWindow'
import type { DeckColumn } from '@/stores/deck'

const PIP_WIDTH = 375
const PIP_HEIGHT = 700
const PIP_MIN_WIDTH = 280
const PIP_MIN_HEIGHT = 400

const pipWindows = new Map<string, WebviewWindow>()
const creatingSet = new Set<string>()
let pipCounter = 0

function genPipLabel(): string {
  return `pip-${Date.now()}-${++pipCounter}`
}

/**
 * Open a new PiP window.
 * - Without columnConfig: shows column selector inside the PiP window
 * - With columnConfig: immediately renders the specified column
 */
export async function openPipWindow(
  columnConfig?: Omit<DeckColumn, 'id'>,
): Promise<void> {
  const label = genPipLabel()

  if (creatingSet.has(label)) return
  creatingSet.add(label)

  try {
    let url = '/pip'
    if (columnConfig) {
      const encoded = btoa(encodeURIComponent(JSON.stringify(columnConfig)))
      url = `/pip?col=${encoded}`
    }

    const win = new WebviewWindow(label, {
      url,
      title: 'NoteDeck PiP',
      width: PIP_WIDTH,
      height: PIP_HEIGHT,
      minWidth: PIP_MIN_WIDTH,
      minHeight: PIP_MIN_HEIGHT,
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

    pipWindows.set(label, win)

    // Clean up reference when window is closed
    win.once('tauri://destroyed', () => {
      pipWindows.delete(label)
    })
  } catch {
    // ignore
  } finally {
    creatingSet.delete(label)
  }
}

export async function closeAllPipWindows(): Promise<void> {
  for (const [, win] of pipWindows) {
    try {
      await win.close()
    } catch {
      // Already closed
    }
  }
  pipWindows.clear()
}

export function isPipOpen(): boolean {
  return pipWindows.size > 0
}

/**
 * Listen for IPC events from PiP windows (call from main window).
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
  return unlisten
}
