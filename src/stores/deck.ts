import { listen } from '@tauri-apps/api/event'
import { defineStore } from 'pinia'
import { computed, ref, toRaw } from 'vue'
import type { TimelineFilter, TimelineType } from '@/adapters/types'
import { useAccountsStore } from '@/stores/accounts'

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

const DECK_KEY = 'nd-deck'

export const useDeckStore = defineStore('deck', () => {
  const columns = ref<DeckColumn[]>([])
  const layout = ref<string[][]>([])
  const navCollapsed = ref(false)
  const activeColumnId = ref<string | null>(null)
  /** This window's sub-window ID (null = main window) */
  const currentWindowId = ref<string | null>(null)

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

  const activeColumnUri = computed(() => {
    if (!activeColumnId.value) return null
    const col = columns.value.find((c) => c.id === activeColumnId.value)
    if (!col) return null
    if (col.type === 'widget') {
      return `notedeck://widget/${col.id}`
    }
    if (col.type === 'aiscript') {
      return `notedeck://aiscript/${col.id}`
    }
    if (col.type === 'play') {
      return `notedeck://play/${col.id}`
    }
    if (col.type === 'apiDocs') {
      return 'notedeck://api/docs'
    }
    if (col.type === 'lookup') {
      return `notedeck://lookup/${col.id}`
    }
    if (col.type === 'serverInfo') {
      return `notedeck://server-info/${col.id}`
    }
    if (!col.accountId) return null

    const accountsStore = useAccountsStore()
    const account = accountsStore.accounts.find((a) => a.id === col.accountId)
    if (!account) return null

    const host = account.host
    switch (col.type) {
      case 'timeline':
        return `notedeck://${host}/timeline/${col.tl ?? 'home'}`
      case 'notifications':
        return `notedeck://${host}/notifications`
      case 'search':
        return `notedeck://${host}/search${col.query ? `?q=${col.query}` : ''}`
      case 'list':
        return `notedeck://${host}/list/${col.listId}`
      case 'antenna':
        return `notedeck://${host}/antenna/${col.antennaId}`
      case 'favorites':
        return `notedeck://${host}/favorites`
      case 'clip':
        return `notedeck://${host}/clip/${col.clipId}`
      case 'channel':
        return `notedeck://${host}/channel/${col.channelId}`
      case 'user':
        return `notedeck://${host}/user/${col.userId}`
      case 'mentions':
        return `notedeck://${host}/mentions`
      case 'specified':
        return `notedeck://${host}/direct`
      case 'chat':
        return `notedeck://${host}/chat`
      case 'announcements':
        return `notedeck://${host}/announcements`
      case 'drive':
        return `notedeck://${host}/drive`
      case 'gallery':
        return `notedeck://${host}/gallery`
      default:
        return null
    }
  })

  function addColumn(partial: Omit<DeckColumn, 'id'>) {
    const col: DeckColumn = { ...partial, id: genColumnId() }
    columns.value.push(col)
    layout.value.push([col.id])
    save()
    return col
  }

  function removeColumn(id: string) {
    columns.value = columns.value.filter((c) => c.id !== id)
    layout.value = layout.value
      .map((ids) => ids.filter((_id) => _id !== id))
      .filter((ids) => ids.length > 0)
    save()
  }

  function updateColumn(id: string, updates: Partial<DeckColumn>) {
    const col = getColumn(id)
    if (col) {
      Object.assign(col, updates)
      save()
    }
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
    layout.value = newLayout
    save()
  }

  function stackColumn(
    fromId: string,
    toId: string,
    position: 'above' | 'below',
  ) {
    if (fromId === toId) return
    const fromGroupIdx = layout.value.findIndex((ids) => ids.includes(fromId))
    const toGroupIdx = layout.value.findIndex((ids) => ids.includes(toId))
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
    const targetIdx = newLayout.findIndex((ids) => ids.includes(toId))
    if (targetIdx < 0) return
    const targetGroup = newLayout[targetIdx]
    if (!targetGroup) return

    // Insert into target group
    const toPos = targetGroup.indexOf(toId)
    const insertAt = position === 'above' ? toPos : toPos + 1
    const newTargetGroup = [...targetGroup]
    newTargetGroup.splice(insertAt, 0, fromId)
    newLayout[targetIdx] = newTargetGroup

    layout.value = newLayout
    save()
  }

  function swapInGroup(idA: string, idB: string) {
    if (idA === idB) return
    const groupIdx = layout.value.findIndex(
      (ids) => ids.includes(idA) && ids.includes(idB),
    )
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
    layout.value = newLayout
    save()
  }

  function insertColumnAt(id: string, targetIndex: number) {
    const groupIdx = layout.value.findIndex((ids) => ids.includes(id))
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
    layout.value = newLayout
    save()
  }

  function unstackColumn(id: string) {
    const groupIdx = layout.value.findIndex((ids) => ids.includes(id))
    if (groupIdx < 0) return
    const group = layout.value[groupIdx]
    if (!group || group.length <= 1) return

    const newGroup = group.filter((colId) => colId !== id)
    const newLayout = [...layout.value]
    newLayout[groupIdx] = newGroup
    // Insert as new solo group right after
    newLayout.splice(groupIdx + 1, 0, [id])
    layout.value = newLayout
    save()
  }

  function moveLeft(id: string) {
    const idx = layout.value.findIndex((ids) => ids.includes(id))
    if (idx > 0) swapColumns(idx, idx - 1)
  }

  function moveRight(id: string) {
    const idx = layout.value.findIndex((ids) => ids.includes(id))
    if (idx < layout.value.length - 1) swapColumns(idx, idx + 1)
  }

  function getColumn(id: string): DeckColumn | undefined {
    return columns.value.find((c) => c.id === id)
  }

  let saveTimer: ReturnType<typeof setTimeout> | null = null

  function flushSave() {
    if (saveTimer) {
      clearTimeout(saveTimer)
      saveTimer = null
    }
    try {
      if (windowProfileId.value) {
        // Save to the profile entry
        const profiles = loadProfiles()
        const profile = profiles.find((p) => p.id === windowProfileId.value)
        if (profile) {
          profile.columns = structuredClone(toRaw(columns.value))
          profile.layout = structuredClone(toRaw(layout.value))
          saveProfiles(profiles)
        }
      }
      // Always keep nd-deck in sync for backward compatibility
      localStorage.setItem(
        DECK_KEY,
        JSON.stringify({ columns: columns.value, layout: layout.value }),
      )
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
    try {
      const raw = localStorage.getItem(DECK_KEY)
      if (!raw) return
      const data = JSON.parse(raw)
      if (data.columns && data.layout) {
        columns.value = data.columns
        layout.value = data.layout
      }
    } catch (e) {
      console.warn('[deck] failed to load:', e)
    }

    // Fix blank profile names from previous sessions
    const profiles = loadProfiles()
    let needsSave = false
    for (const [i, profile] of profiles.entries()) {
      if (!profile.name || profile.name.trim() === '') {
        profile.name = `プロファイル ${i + 1}`
        needsSave = true
      }
    }
    if (needsSave) saveProfiles(profiles)

    // Ensure a default profile exists
    if (profiles.length === 0) {
      const profile: DeckProfile = {
        id: genProfileId(),
        name: 'プロファイル 1',
        columns: structuredClone(toRaw(columns.value)),
        layout: structuredClone(toRaw(layout.value)),
        createdAt: Date.now(),
      }
      profiles.push(profile)
      saveProfiles(profiles)
      saveActiveProfileId(profile.id)
    } else {
      loadActiveProfileId()
    }

    // All windows use windowProfileId — set it from query or activeProfileId
    const params = new URLSearchParams(window.location.search)
    const profileId = params.get('profile')
    const windowId = params.get('window')
    if (windowId) {
      currentWindowId.value = windowId
    }
    if (profileId) {
      initWindowProfile(profileId)
    } else if (activeProfileId.value) {
      initWindowProfile(activeProfileId.value)
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

  // --- Wallpaper ---
  const WALLPAPER_KEY = 'nd-deck-wallpaper'
  const wallpaper = ref<string | null>(null)

  function setWallpaper(url: string) {
    wallpaper.value = url
    localStorage.setItem(WALLPAPER_KEY, url)
  }

  function clearWallpaper() {
    wallpaper.value = null
    localStorage.removeItem(WALLPAPER_KEY)
  }

  function loadWallpaper() {
    wallpaper.value = localStorage.getItem(WALLPAPER_KEY)
  }

  // --- Profile management ---
  const PROFILES_KEY = 'nd-deck-profiles'
  const ACTIVE_PROFILE_KEY = 'nd-deck-active-profile'
  const activeProfileId = ref<string | null>(null)
  /** Per-window profile ID (set via ?profile= query). Isolates this window from deck:sync. */
  const windowProfileId = ref<string | null>(null)
  /** Bumped on every saveProfiles() to make profile-derived computeds reactive */
  const profileVersion = ref(0)

  const currentProfileName = computed(() => {
    // Depend on both windowProfileId and profileVersion for reactivity
    const _v = profileVersion.value
    if (!windowProfileId.value) return null
    const profiles = loadProfiles()
    return profiles.find((p) => p.id === windowProfileId.value)?.name ?? null
  })

  function loadProfiles(): DeckProfile[] {
    try {
      const raw = localStorage.getItem(PROFILES_KEY)
      return raw ? JSON.parse(raw) : []
    } catch {
      return []
    }
  }

  function saveProfiles(profiles: DeckProfile[]) {
    localStorage.setItem(PROFILES_KEY, JSON.stringify(profiles))
    profileVersion.value++
  }

  function saveActiveProfileId(id: string | null) {
    activeProfileId.value = id
    if (id) {
      localStorage.setItem(ACTIVE_PROFILE_KEY, id)
    } else {
      localStorage.removeItem(ACTIVE_PROFILE_KEY)
    }
  }

  function loadActiveProfileId() {
    activeProfileId.value = localStorage.getItem(ACTIVE_PROFILE_KEY)
  }

  /** Save current deck state into the active profile */
  function syncCurrentToActiveProfile() {
    if (!windowProfileId.value) return
    const profiles = loadProfiles()
    const profile = profiles.find((p) => p.id === windowProfileId.value)
    if (!profile) return
    profile.columns = structuredClone(toRaw(columns.value))
    profile.layout = structuredClone(toRaw(layout.value))
    saveProfiles(profiles)
  }

  let profileCounter = 0
  function genProfileId(): string {
    return `profile-${Date.now()}-${++profileCounter}`
  }

  /** Find the next available "プロファイル N" name */
  function nextProfileName(profiles: DeckProfile[]): string {
    const names = new Set(profiles.map((p) => p.name))
    for (let i = 1; ; i++) {
      const candidate = `プロファイル ${i}`
      if (!names.has(candidate)) return candidate
    }
  }

  function saveAsProfile(name?: string): DeckProfile {
    // Save current state to the active profile before creating a new one
    syncCurrentToActiveProfile()

    const profiles = loadProfiles()
    const autoName = name || nextProfileName(profiles)

    const profile: DeckProfile = {
      id: genProfileId(),
      name: autoName,
      columns: [],
      layout: [],
      createdAt: Date.now(),
    }
    profiles.push(profile)
    saveProfiles(profiles)
    saveActiveProfileId(profile.id)

    // Switch to the new empty profile
    windowProfileId.value = profile.id
    columns.value = []
    layout.value = []
    flushSave()

    return profile
  }

  /** Create an empty profile without switching the current window to it */
  function createEmptyProfile(name?: string): DeckProfile {
    const profiles = loadProfiles()
    const autoName = name || nextProfileName(profiles)
    const profile: DeckProfile = {
      id: genProfileId(),
      name: autoName,
      columns: [],
      layout: [],
      createdAt: Date.now(),
    }
    profiles.push(profile)
    saveProfiles(profiles)
    return profile
  }

  function getProfiles(): DeckProfile[] {
    return loadProfiles()
  }

  function applyProfile(profileId: string) {
    // Save current state before switching
    syncCurrentToActiveProfile()

    const profiles = loadProfiles()
    const profile = profiles.find((p) => p.id === profileId)
    if (!profile) return
    columns.value = structuredClone(profile.columns)
    layout.value = structuredClone(profile.layout)
    windowProfileId.value = profileId
    saveActiveProfileId(profileId)
    flushSave()
  }

  function deleteProfile(profileId: string) {
    const profiles = loadProfiles().filter((p) => p.id !== profileId)
    saveProfiles(profiles)
    if (activeProfileId.value === profileId) {
      saveActiveProfileId(profiles[0]?.id ?? null)
    }
  }

  function renameProfile(profileId: string, newName: string) {
    const profiles = loadProfiles()
    const profile = profiles.find((p) => p.id === profileId)
    if (profile) {
      profile.name = newName
      saveProfiles(profiles)
    }
  }

  /** Listen for sync events from other windows and reload shared state */
  let unlistenSync: (() => void) | null = null

  async function startSync() {
    unlistenSync?.()
    unlistenSync = await listen('deck:sync', () => {
      // Noop — each window manages its own profile now.
      // Kept for future cross-window notifications if needed.
    })
  }

  /** Initialize this window with an isolated profile (used by sub-windows via ?profile= query) */
  function initWindowProfile(profileId: string) {
    windowProfileId.value = profileId
    const profiles = loadProfiles()
    const profile = profiles.find((p) => p.id === profileId)
    if (profile) {
      columns.value = structuredClone(profile.columns)
      layout.value = structuredClone(profile.layout)
    } else {
      // Profile not found — start empty
      columns.value = []
      layout.value = []
    }
  }

  function stopSync() {
    unlistenSync?.()
    unlistenSync = null
  }

  // --- Multi-window column management ---

  /** Layout groups visible in the current window */
  const windowLayout = computed(() => {
    const wid = currentWindowId.value
    return layout.value.filter((group) =>
      group.some((colId) => {
        const col = columns.value.find((c) => c.id === colId)
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
    // Unstack first
    unstackColumn(columnId)
    // Assign to sub-window
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
  function moveColumnToWindow(
    columnId: string,
    targetWindowId: string | null,
  ) {
    const col = getColumn(columnId)
    if (!col) return
    col.windowId = targetWindowId || undefined
    save()
  }

  /** Save window layout (position/size) to the current profile */
  function saveWindowLayout(windowLayout: DeckWindowLayout) {
    if (!windowProfileId.value) return
    const profiles = loadProfiles()
    const profile = profiles.find((p) => p.id === windowProfileId.value)
    if (!profile) return
    if (!profile.windows) profile.windows = []
    const existing = profile.windows.findIndex((w) => w.id === windowLayout.id)
    if (existing >= 0) {
      profile.windows[existing] = windowLayout
    } else {
      profile.windows.push(windowLayout)
    }
    saveProfiles(profiles)
  }

  /** Remove a window layout entry from the current profile */
  function removeWindowLayout(windowId: string) {
    if (!windowProfileId.value) return
    const profiles = loadProfiles()
    const profile = profiles.find((p) => p.id === windowProfileId.value)
    if (!profile?.windows) return
    profile.windows = profile.windows.filter((w) => w.id !== windowId)
    saveProfiles(profiles)
  }

  /** Get saved window layouts for the current profile */
  function getWindowLayouts(): DeckWindowLayout[] {
    if (!windowProfileId.value) return []
    const profiles = loadProfiles()
    const profile = profiles.find((p) => p.id === windowProfileId.value)
    return profile?.windows ?? []
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
    load,
    clear,
    addWidget,
    removeWidget,
    updateWidgetData,
    wallpaper,
    setWallpaper,
    clearWallpaper,
    loadWallpaper,
    activeProfileId,
    loadActiveProfileId,
    syncCurrentToActiveProfile,
    saveAsProfile,
    getProfiles,
    applyProfile,
    deleteProfile,
    renameProfile,
    windowProfileId,
    currentProfileName,
    initWindowProfile,
    createEmptyProfile,
    currentWindowId,
    windowLayout,
    popOutColumn,
    recallColumn,
    recallColumnsFromWindow,
    moveColumnToWindow,
    saveWindowLayout,
    removeWindowLayout,
    getWindowLayouts,
    startSync,
    stopSync,
  }
})
