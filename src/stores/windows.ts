import { defineStore } from 'pinia'
import { computed, ref } from 'vue'

export type WindowType =
  | 'note-detail'
  | 'user-profile'
  | 'follow-list'
  | 'login'
  | 'search'
  | 'notifications'
  | 'plugins'
  | 'keybinds'
  | 'cssEditor'
  | 'ai'
  | 'chat'

export interface DeckWindow {
  id: string
  type: WindowType
  props: Record<string, unknown>
  x: number
  y: number
  zIndex: number
  modal: boolean
  minimized: boolean
  maximized: boolean
}

export const WINDOW_SIZES: Record<
  WindowType,
  { width: number; maxHeight: number }
> = {
  'note-detail': { width: 500, maxHeight: 600 },
  'user-profile': { width: 500, maxHeight: 650 },
  'follow-list': { width: 500, maxHeight: 650 },
  login: { width: 420, maxHeight: 480 },
  search: { width: 500, maxHeight: 650 },
  notifications: { width: 500, maxHeight: 650 },
  plugins: { width: 500, maxHeight: 650 },
  keybinds: { width: 560, maxHeight: 650 },
  cssEditor: { width: 480, maxHeight: 650 },
  ai: { width: 480, maxHeight: 650 },
  chat: { width: 500, maxHeight: 650 },
}

export const useWindowsStore = defineStore('windows', () => {
  const windows = ref<DeckWindow[]>([])
  let windowCounter = 0
  let topZIndex = 1500

  const hasModal = computed(() => windows.value.some((w) => w.modal))

  function open(type: WindowType, props: Record<string, unknown> = {}): string {
    // Deduplicate: same note/user/login → focus existing
    const duplicate = windows.value.find((w) => {
      if (w.type !== type) return false
      if (type === 'note-detail')
        return (
          w.props.noteId === props.noteId &&
          w.props.accountId === props.accountId
        )
      if (type === 'user-profile')
        return (
          w.props.userId === props.userId &&
          w.props.accountId === props.accountId
        )
      if (type === 'follow-list')
        return (
          w.props.userId === props.userId &&
          w.props.accountId === props.accountId
        )
      if (type === 'login') return true
      if (type === 'search') return true
      if (type === 'notifications') return true
      if (type === 'plugins') return true
      if (type === 'keybinds') return true
      if (type === 'cssEditor') return true
      if (type === 'ai') return true
      if (type === 'chat') return true
      return false
    })
    if (duplicate) {
      bringToFront(duplicate.id)
      return duplicate.id
    }

    const size = WINDOW_SIZES[type]
    const viewW = document.documentElement.clientWidth
    const viewH = document.documentElement.clientHeight
    const offset = (windows.value.length % 5) * 30
    const x = Math.max(50, (viewW - size.width) / 2 + offset)
    const y = Math.max(50, (viewH - size.maxHeight) / 2 + offset)

    topZIndex++
    const id = `win-${Date.now()}-${++windowCounter}`
    const isModal = type === 'login'
    const win: DeckWindow = {
      id,
      type,
      props,
      x,
      y,
      zIndex: isModal ? topZIndex + 300 : topZIndex,
      modal: isModal,
      minimized: false,
      maximized: false,
    }
    windows.value.push(win)
    return id
  }

  function close(id: string) {
    windows.value = windows.value.filter((w) => w.id !== id)
  }

  function bringToFront(id: string) {
    const win = windows.value.find((w) => w.id === id)
    if (!win) return
    topZIndex++
    win.zIndex = win.modal ? topZIndex + 300 : topZIndex
  }

  function updatePosition(id: string, x: number, y: number) {
    const win = windows.value.find((w) => w.id === id)
    if (win) {
      win.x = x
      win.y = y
    }
  }

  function toggleMinimize(id: string) {
    const win = windows.value.find((w) => w.id === id)
    if (!win) return
    win.minimized = !win.minimized
    if (!win.minimized) win.maximized = false
  }

  function toggleMaximize(id: string) {
    const win = windows.value.find((w) => w.id === id)
    if (!win) return
    win.maximized = !win.maximized
    if (win.maximized) win.minimized = false
  }

  function closeAll() {
    windows.value = []
  }

  return {
    windows,
    hasModal,
    open,
    close,
    bringToFront,
    updatePosition,
    toggleMinimize,
    toggleMaximize,
    closeAll,
  }
})
