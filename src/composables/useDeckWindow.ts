import { WebviewWindow } from '@tauri-apps/api/webviewWindow'

let windowCounter = 0

function genWindowId(): string {
  return `deck-${Date.now()}-${++windowCounter}`
}

const openWindows = new Map<string, WebviewWindow>()

/**
 * Open a new deck window with the given profile.
 * @param profileId - The profile ID to open in the new window
 */
export async function openDeckWindow(
  profileId: string,
): Promise<string | null> {
  const windowId = genWindowId()
  const url = `/?profile=${profileId}`

  try {
    const win = new WebviewWindow(windowId, {
      url,
      title: 'NoteDeck',
      width: 900,
      height: 700,
      minWidth: 400,
      minHeight: 400,
      decorations: false,
      transparent: true,
      resizable: true,
      visible: false,
      dragDropEnabled: true,
    })

    await new Promise<void>((resolve, reject) => {
      win.once('tauri://created', () => resolve())
      win.once('tauri://error', (e) => reject(new Error(String(e.payload))))
    })

    openWindows.set(windowId, win)

    win.once('tauri://destroyed', () => {
      openWindows.delete(windowId)
    })

    return windowId
  } catch (e) {
    console.warn('[deck-window] failed to open:', e)
    return null
  }
}

export function getOpenDeckWindows(): ReadonlyMap<string, WebviewWindow> {
  return openWindows
}
