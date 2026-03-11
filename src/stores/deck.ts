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

export type WidgetType = 'aiscriptConsole' | 'aiscriptApp'

export interface WidgetConfig {
  id: string
  type: WidgetType
  data: Record<string, unknown>
}

export interface DeckProfile {
  id: string
  name: string
  columns: DeckColumn[]
  layout: string[][]
  createdAt: number
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
}

let columnCounter = 0
function genColumnId(): string {
  return `col-${Date.now()}-${++columnCounter}`
}

export const useDeckStore = defineStore('deck', () => {
  const columns = ref<DeckColumn[]>([])
  const layout = ref<string[][]>([])
  const navCollapsed = ref(false)
  const activeColumnId = ref<string | null>(null)

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
  function save() {
    if (saveTimer) return
    saveTimer = setTimeout(() => {
      saveTimer = null
      try {
        localStorage.setItem(
          DECK_KEY,
          JSON.stringify({ columns: columns.value, layout: layout.value }),
        )
      } catch (e) {
        console.warn('[deck] failed to save:', e)
      }
    }, 100)
  }

  function load() {
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

    // Ensure a default "Main" profile exists
    if (profiles.length === 0) {
      const profile: DeckProfile = {
        id: genProfileId(),
        name: 'Main',
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
  const DECK_KEY = 'nd-deck'
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
    if (!activeProfileId.value) return
    const profiles = loadProfiles()
    const profile = profiles.find((p) => p.id === activeProfileId.value)
    if (!profile) return
    profile.columns = structuredClone(toRaw(columns.value))
    profile.layout = structuredClone(toRaw(layout.value))
    saveProfiles(profiles)
  }

  let profileCounter = 0
  function genProfileId(): string {
    return `profile-${Date.now()}-${++profileCounter}`
  }

  function saveAsProfile(name?: string): DeckProfile {
    // Save current state to the active profile before creating a new one
    syncCurrentToActiveProfile()

    const profiles = loadProfiles()
    const autoName = name || `プロファイル ${profiles.length + 1}`

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

    // Switch to the empty new profile
    columns.value = []
    layout.value = []
    save()

    return profile
  }

  function getProfiles(): DeckProfile[] {
    return loadProfiles()
  }

  function applyProfile(profileId: string) {
    // Save current state to the currently active profile before switching
    syncCurrentToActiveProfile()

    const profiles = loadProfiles()
    const profile = profiles.find((p) => p.id === profileId)
    if (!profile) return
    columns.value = structuredClone(profile.columns)
    layout.value = structuredClone(profile.layout)
    saveActiveProfileId(profileId)
    save()
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
  }
})
