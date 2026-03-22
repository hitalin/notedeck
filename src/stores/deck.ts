import { listen } from '@tauri-apps/api/event'
import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import type { TimelineFilter, TimelineType } from '@/adapters/types'
import { useAccountsStore } from '@/stores/accounts'
import { useDeckProfileStore } from '@/stores/deckProfile'
import { useDeckWallpaperStore } from '@/stores/deckWallpaper'
import { getStorageJson, STORAGE_KEYS, setStorageJson } from '@/utils/storage'

export type ColumnType =
  | 'timeline'
  | 'notifications'
  | 'search'
  | 'list'
  | 'antenna'
  | 'favorites'
  | 'clip'
  | 'user'
  | 'mentions'
  | 'channel'
  | 'specified'
  | 'chat'
  | 'widget'
  | 'aiscript'
  | 'play'
  | 'page'
  | 'ai'
  | 'announcements'
  | 'drive'
  | 'gallery'
  | 'explore'
  | 'followRequests'
  | 'achievements'
  | 'apiConsole'
  | 'apiDocs'
  | 'lookup'
  | 'serverInfo'
  | 'ads'
  | 'aboutMisskey'
  | 'emoji'

export type WidgetType = 'aiscriptConsole' | 'aiscriptApp'

export interface WidgetConfig {
  id: string
  type: WidgetType
  data: Record<string, unknown>
}

export interface DeckWindowLayout {
  id: string
  x: number
  y: number
  width: number
  height: number
  monitor?: string
}

export interface DeckProfile {
  id: string
  name: string
  columns: DeckColumn[]
  layout: string[][]
  createdAt: number
  /** Window positions/sizes for multi-window layouts */
  windows?: DeckWindowLayout[]
}

export interface DeckColumn {
  id: string
  type: ColumnType
  name: string | null
  width: number
  accountId: string | null
  tl?: TimelineType
  query?: string
  active?: boolean
  filters?: TimelineFilter
  listId?: string
  antennaId?: string
  clipId?: string
  channelId?: string
  userId?: string
  widgets?: WidgetConfig[]
  aiscriptCode?: string
  flashId?: string
  pageId?: string
  soundMuted?: boolean
  folderId?: string | null
  /** Window assignment: undefined/null = main window */
  windowId?: string
}

let columnCounter = 0
function genColumnId(): string {
  return `col-${Date.now()}-${++columnCounter}`
}

export const useDeckStore = defineStore('deck', () => {
  const profileStore = useDeckProfileStore()
  const wallpaperStore = useDeckWallpaperStore()

  const columns = ref<DeckColumn[]>([])
  const layout = ref<string[][]>([])
  const navCollapsed = ref(false)
  const activeColumnId = ref<string | null>(null)
  /** This window's sub-window ID (null = main window) */
  const currentWindowId = ref<string | null>(null)
  /** Column ID being dragged from another window (for cross-window D&D overlay) */
  const crossWindowDragColumnId = ref<string | null>(null)

  /** O(1) column lookup by ID */
  const columnMap = computed(() => new Map(columns.value.map((c) => [c.id, c])))

  function setActiveColumn(id: string) {
    activeColumnId.value = id
  }

  function focusNextColumn() {
    if (columns.value.length === 0) return
    const idx = columns.value.findIndex((c) => c.id === activeColumnId.value)
    const next = idx < 0 ? 0 : Math.min(idx + 1, columns.value.length - 1)
    const col = columns.value[next]
    if (col) activeColumnId.value = col.id
  }

  function focusPrevColumn() {
    if (columns.value.length === 0) return
    const idx = columns.value.findIndex((c) => c.id === activeColumnId.value)
    const prev = idx <= 0 ? 0 : idx - 1
    const col = columns.value[prev]
    if (col) activeColumnId.value = col.id
  }

  function focusColumnByIndex(index: number) {
    const col = columns.value[index]
    if (col) activeColumnId.value = col.id
  }

  const localUriBuilders: Partial<
    Record<DeckColumn['type'], (col: DeckColumn) => string>
  > = {
    widget: (col) => `notedeck://widget/${col.id}`,
    aiscript: (col) => `notedeck://aiscript/${col.id}`,
    play: (col) => `notedeck://play/${col.id}`,
    apiDocs: () => 'notedeck://api/docs',
    lookup: (col) => `notedeck://lookup/${col.id}`,
    serverInfo: (col) => `notedeck://server-info/${col.id}`,
  }

  const accountUriBuilders: Partial<
    Record<DeckColumn['type'], (col: DeckColumn, host: string) => string>
  > = {
    timeline: (col, host) => `notedeck://${host}/timeline/${col.tl ?? 'home'}`,
    notifications: (_, host) => `notedeck://${host}/notifications`,
    search: (col, host) =>
      `notedeck://${host}/search${col.query ? `?q=${col.query}` : ''}`,
    list: (col, host) => `notedeck://${host}/list/${col.listId}`,
    antenna: (col, host) => `notedeck://${host}/antenna/${col.antennaId}`,
    favorites: (_, host) => `notedeck://${host}/favorites`,
    clip: (col, host) => `notedeck://${host}/clip/${col.clipId}`,
    channel: (col, host) => `notedeck://${host}/channel/${col.channelId}`,
    user: (col, host) => `notedeck://${host}/user/${col.userId}`,
    mentions: (_, host) => `notedeck://${host}/mentions`,
    specified: (_, host) => `notedeck://${host}/direct`,
    chat: (_, host) => `notedeck://${host}/chat`,
    announcements: (_, host) => `notedeck://${host}/announcements`,
    drive: (_, host) => `notedeck://${host}/drive`,
    gallery: (_, host) => `notedeck://${host}/gallery`,
  }

  const activeColumnUri = computed(() => {
    if (!activeColumnId.value) return null
    const col = getColumn(activeColumnId.value)
    if (!col) return null

    const localBuilder = localUriBuilders[col.type]
    if (localBuilder) return localBuilder(col)

    if (!col.accountId) return null
    const accountsStore = useAccountsStore()
    const account = accountsStore.accounts.find((a) => a.id === col.accountId)
    if (!account) return null

    const accountBuilder = accountUriBuilders[col.type]
    return accountBuilder ? accountBuilder(col, account.host) : null
  })

  function addColumn(partial: Omit<DeckColumn, 'id'>) {
    const col: DeckColumn = { ...partial, id: genColumnId() }
    columns.value.push(col)
    layout.value.push([col.id])
    save()
    activeColumnId.value = col.id
    return col
  }

  function removeColumn(id: string) {
    columns.value = columns.value.filter((c) => c.id !== id)
    layout.value = layout.value
      .map((ids) => ids.filter((_id) => _id !== id))
      .filter((ids) => ids.length > 0)
    flushSave()
  }

  function updateColumn(id: string, updates: Partial<DeckColumn>) {
    const col = getColumn(id)
    if (col) {
      Object.assign(col, updates)
      save()
    }
  }

  /** Find the group index containing a column ID. */
  function groupIndexOf(colId: string, layoutSnapshot?: string[][]): number {
    const l = layoutSnapshot ?? layout.value
    for (let i = 0; i < l.length; i++) {
      if (l[i]?.includes(colId)) return i
    }
    return -1
  }

  function applyLayout(newLayout: string[][]) {
    layout.value = newLayout
    save()
  }

  function swapColumns(aIdx: number, bIdx: number) {
    if (
      aIdx < 0 ||
      bIdx < 0 ||
      aIdx >= layout.value.length ||
      bIdx >= layout.value.length
    )
      return
    const newLayout = [...layout.value]
    const a = newLayout[aIdx]
    const b = newLayout[bIdx]
    if (!a || !b) return
    newLayout[aIdx] = b
    newLayout[bIdx] = a
    applyLayout(newLayout)
  }

  function stackColumn(
    fromId: string,
    toId: string,
    position: 'above' | 'below',
  ) {
    if (fromId === toId) return
    const fromGroupIdx = groupIndexOf(fromId)
    const toGroupIdx = groupIndexOf(toId)
    if (fromGroupIdx < 0 || toGroupIdx < 0) return

    // Remove fromId from its current group
    const fromGroup = layout.value[fromGroupIdx]
    if (!fromGroup) return
    const newFromGroup = fromGroup.filter((id) => id !== fromId)

    const newLayout = [...layout.value]
    // Update or remove the source group
    if (newFromGroup.length === 0) {
      newLayout.splice(fromGroupIdx, 1)
    } else {
      newLayout[fromGroupIdx] = newFromGroup
    }

    // Find target group in updated layout (index may have shifted)
    const targetIdx = groupIndexOf(toId, newLayout)
    if (targetIdx < 0) return
    const targetGroup = newLayout[targetIdx]
    if (!targetGroup) return

    // Insert into target group
    const toPos = targetGroup.indexOf(toId)
    const insertAt = position === 'above' ? toPos : toPos + 1
    const newTargetGroup = [...targetGroup]
    newTargetGroup.splice(insertAt, 0, fromId)
    newLayout[targetIdx] = newTargetGroup

    applyLayout(newLayout)
  }

  function swapInGroup(idA: string, idB: string) {
    if (idA === idB) return
    const groupIdx = groupIndexOf(idA)
    if (groupIdx < 0) return
    const group = layout.value[groupIdx]
    if (!group) return
    const posA = group.indexOf(idA)
    const posB = group.indexOf(idB)
    if (posA < 0 || posB < 0) return
    const newGroup = [...group]
    newGroup[posA] = idB
    newGroup[posB] = idA
    const newLayout = [...layout.value]
    newLayout[groupIdx] = newGroup
    applyLayout(newLayout)
  }

  function insertColumnAt(id: string, targetIndex: number) {
    const groupIdx = groupIndexOf(id)
    if (groupIdx < 0) return
    const group = layout.value[groupIdx]
    if (!group) return

    // Solo column already at this position — nothing to do
    if (group.length === 1 && groupIdx === targetIndex) return

    // Remove from current group
    const newGroup = group.filter((colId) => colId !== id)
    const newLayout = [...layout.value]
    if (newGroup.length === 0) {
      newLayout.splice(groupIdx, 1)
    } else {
      newLayout[groupIdx] = newGroup
    }

    // Adjust target index if removal shifted it
    const adjustedIndex =
      newGroup.length === 0 && targetIndex > groupIdx
        ? targetIndex - 1
        : targetIndex
    const clampedIndex = Math.max(0, Math.min(adjustedIndex, newLayout.length))
    newLayout.splice(clampedIndex, 0, [id])
    applyLayout(newLayout)
  }

  function unstackColumn(id: string) {
    const groupIdx = groupIndexOf(id)
    if (groupIdx < 0) return
    const group = layout.value[groupIdx]
    if (!group || group.length <= 1) return

    const newGroup = group.filter((colId) => colId !== id)
    const newLayout = [...layout.value]
    newLayout[groupIdx] = newGroup
    // Insert as new solo group right after
    newLayout.splice(groupIdx + 1, 0, [id])
    applyLayout(newLayout)
  }

  function moveLeft(id: string) {
    const idx = groupIndexOf(id)
    if (idx > 0) swapColumns(idx, idx - 1)
  }

  function moveRight(id: string) {
    const idx = groupIndexOf(id)
    if (idx < layout.value.length - 1) swapColumns(idx, idx + 1)
  }

  function getColumn(id: string): DeckColumn | undefined {
    return columnMap.value.get(id)
  }

  let saveTimer: ReturnType<typeof setTimeout> | null = null

  function flushSave() {
    if (saveTimer) {
      clearTimeout(saveTimer)
      saveTimer = null
    }
    try {
      if (profileStore.windowProfileId) {
        profileStore.syncColumnsToProfile(
          profileStore.windowProfileId,
          columns.value,
          layout.value,
        )
      }
      // Always keep nd-deck in sync for backward compatibility
      setStorageJson(STORAGE_KEYS.deck, {
        columns: columns.value,
        layout: layout.value,
      })
    } catch (e) {
      console.warn('[deck] failed to save:', e)
    }
  }

  function save() {
    if (saveTimer) clearTimeout(saveTimer)
    saveTimer = setTimeout(() => {
      saveTimer = null
      flushSave()
    }, 100)
  }

  function load() {
    // Load from nd-deck (backward compat / initial data)
    const data = getStorageJson<{
      columns?: DeckColumn[]
      layout?: string[][]
    } | null>(STORAGE_KEYS.deck, null)
    if (data?.columns && data?.layout) {
      columns.value = data.columns
      layout.value = data.layout
    }

    profileStore.ensureDefaults(columns.value, layout.value)

    // All windows use windowProfileId — set it from query or activeProfileId
    const params = new URLSearchParams(window.location.search)
    const profileId = params.get('profile')
    const windowId = params.get('window')
    if (windowId) {
      currentWindowId.value = windowId
    }
    if (profileId) {
      const data = profileStore.initWindowProfile(profileId)
      columns.value = data.columns
      layout.value = data.layout
    } else if (profileStore.activeProfileId) {
      const data = profileStore.initWindowProfile(profileStore.activeProfileId)
      columns.value = data.columns
      layout.value = data.layout
    }
  }

  // Widget helpers
  let widgetCounter = 0
  function genWidgetId(): string {
    return `wgt-${Date.now()}-${++widgetCounter}`
  }

  function addWidget(
    columnId: string,
    type: WidgetType,
    initialData?: Record<string, unknown>,
  ) {
    const col = getColumn(columnId)
    if (!col || col.type !== 'widget') return
    if (!col.widgets) col.widgets = []
    col.widgets.push({ id: genWidgetId(), type, data: initialData ?? {} })
    save()
  }

  function removeWidget(columnId: string, widgetId: string) {
    const col = getColumn(columnId)
    if (!col?.widgets) return
    col.widgets = col.widgets.filter((w) => w.id !== widgetId)
    save()
  }

  function updateWidgetData(
    columnId: string,
    widgetId: string,
    data: Record<string, unknown>,
  ) {
    const col = getColumn(columnId)
    const widget = col?.widgets?.find((w) => w.id === widgetId)
    if (!widget) return
    widget.data = { ...widget.data, ...data }
    save()
  }

  function clear() {
    columns.value = []
    layout.value = []
    save()
  }

  // --- Profile facade (delegates to profileStore) ---

  function syncCurrentToActiveProfile() {
    if (!profileStore.windowProfileId) return
    profileStore.syncColumnsToProfile(
      profileStore.windowProfileId,
      columns.value,
      layout.value,
    )
  }

  function saveAsProfile(name?: string) {
    const profile = profileStore.saveAsProfile(
      name,
      columns.value,
      layout.value,
    )
    columns.value = []
    layout.value = []
    flushSave()
    return profile
  }

  function applyProfile(profileId: string) {
    const result = profileStore.applyProfile(
      profileId,
      columns.value,
      layout.value,
    )
    if (!result) return
    columns.value = result.columns
    layout.value = result.layout
    flushSave()
  }

  // --- Multi-window column management ---

  /** Layout groups visible in the current window */
  const windowLayout = computed(() => {
    const wid = currentWindowId.value
    const colMap = columnMap.value
    return layout.value.filter((group) =>
      group.some((colId) => {
        const col = colMap.get(colId)
        if (!col) return false
        // Main window shows columns without windowId
        if (!wid) return !col.windowId
        // Sub-windows show their assigned columns
        return col.windowId === wid
      }),
    )
  })

  /** Pop out a column to a sub-window. Unstacks first if needed. */
  function popOutColumn(columnId: string, windowId: string) {
    unstackColumn(columnId)
    const col = getColumn(columnId)
    if (col) {
      col.windowId = windowId
      save()
    }
  }

  /** Recall a column from a sub-window back to main */
  function recallColumn(columnId: string) {
    const col = getColumn(columnId)
    if (col) {
      col.windowId = undefined
      save()
    }
  }

  /** Recall all columns from a specific sub-window (e.g. when window closes) */
  function recallColumnsFromWindow(windowId: string) {
    let changed = false
    for (const col of columns.value) {
      if (col.windowId === windowId) {
        col.windowId = undefined
        changed = true
      }
    }
    if (changed) save()
  }

  /** Move a column between windows */
  function moveColumnToWindow(columnId: string, targetWindowId: string | null) {
    const col = getColumn(columnId)
    if (!col) return
    col.windowId = targetWindowId || undefined
    save()
  }

  /** Listen for sync events from other windows */
  let unlistenSync: (() => void) | null = null

  async function startSync() {
    unlistenSync?.()
    unlistenSync = await listen('deck:sync', () => {
      // Noop — each window manages its own profile now.
    })
  }

  function stopSync() {
    unlistenSync?.()
    unlistenSync = null
  }

  return {
    columns,
    layout,
    navCollapsed,
    activeColumnId,
    activeColumnUri,
    setActiveColumn,
    focusNextColumn,
    focusPrevColumn,
    focusColumnByIndex,
    addColumn,
    removeColumn,
    updateColumn,
    swapColumns,
    swapInGroup,
    stackColumn,
    insertColumnAt,
    unstackColumn,
    moveLeft,
    moveRight,
    getColumn,
    save,
    flushSave,
    load,
    clear,
    addWidget,
    removeWidget,
    updateWidgetData,
    // Wallpaper (facade)
    wallpaper: computed(() => wallpaperStore.wallpaper),
    setWallpaper: wallpaperStore.setWallpaper,
    clearWallpaper: wallpaperStore.clearWallpaper,
    loadWallpaper: wallpaperStore.loadWallpaper,
    // Profile (facade)
    activeProfileId: computed(() => profileStore.activeProfileId),
    loadActiveProfileId: profileStore.loadActiveProfileId,
    syncCurrentToActiveProfile,
    saveAsProfile,
    getProfiles: profileStore.getProfiles,
    applyProfile,
    deleteProfile: profileStore.deleteProfile,
    renameProfile: profileStore.renameProfile,
    windowProfileId: computed(() => profileStore.windowProfileId),
    currentProfileName: profileStore.currentProfileName,
    initWindowProfile: profileStore.initWindowProfile,
    createEmptyProfile: profileStore.createEmptyProfile,
    currentWindowId,
    windowLayout,
    popOutColumn,
    recallColumn,
    recallColumnsFromWindow,
    moveColumnToWindow,
    saveWindowLayout: profileStore.saveWindowLayout,
    removeWindowLayout: profileStore.removeWindowLayout,
    getWindowLayouts: profileStore.getWindowLayouts,
    crossWindowDragColumnId,
    startSync,
    stopSync,
  }
})
