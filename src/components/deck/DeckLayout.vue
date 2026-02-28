<script setup lang="ts">
import { invoke } from '@tauri-apps/api/core'
import { openUrl } from '@tauri-apps/plugin-opener'
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import {
  registerDefaultCommands,
  unregisterDefaultCommands,
} from '@/commands/definitions'
import MkPostForm from '@/components/common/MkPostForm.vue'
import { useAccountsStore } from '@/stores/accounts'
import type { DeckColumn } from '@/stores/deck'
import { useDeckStore } from '@/stores/deck'
import {
  clearAvailableTlCache,
  detectAvailableTimelines,
} from '@/utils/customTimelines'
import {
  initDesktopNotifications,
  onNotificationAction,
} from '@/utils/desktopNotification'
import { AppError } from '@/utils/errors'
import DeckAntennaColumn from './DeckAntennaColumn.vue'
import DeckChannelColumn from './DeckChannelColumn.vue'
import DeckClipColumn from './DeckClipColumn.vue'
import DeckFavoritesColumn from './DeckFavoritesColumn.vue'
import DeckListColumn from './DeckListColumn.vue'
import DeckMentionsColumn from './DeckMentionsColumn.vue'
import DeckSpecifiedColumn from './DeckSpecifiedColumn.vue'
import DeckNotificationColumn from './DeckNotificationColumn.vue'
import DeckSearchColumn from './DeckSearchColumn.vue'
import DeckTimelineColumn from './DeckTimelineColumn.vue'
import DeckUserColumn from './DeckUserColumn.vue'

const router = useRouter()
const deckStore = useDeckStore()
const accountsStore = useAccountsStore()
// Pre-build column lookup map to avoid O(n) find per column per render
const columnMap = computed(() => {
  const map = new Map<string, DeckColumn>()
  for (const col of deckStore.columns) {
    map.set(col.id, col)
  }
  return map
})

// Flatten layout into resolved column objects (avoids repeated Map.get in template)
const resolvedColumns = computed(() => {
  const map = columnMap.value
  const result: DeckColumn[] = []
  for (const group of deckStore.layout) {
    for (const colId of group) {
      const col = map.get(colId)
      if (col) result.push(col)
    }
  }
  return result
})

const showAddMenu = ref(false)
const showCompose = ref(false)
const mobileDrawerOpen = ref(false)

// Navbar resize
const MIN_WIDTH = 68
const COLLAPSE_THRESHOLD = 120
const DEFAULT_WIDTH = 200
const MAX_WIDTH = 400
const navWidth = ref(window.innerWidth <= 1279 ? MIN_WIDTH : DEFAULT_WIDTH)
const isResizing = ref(false)
const navCollapsed = computed(() => navWidth.value <= MIN_WIDTH)
watch(navCollapsed, (v) => {
  deckStore.navCollapsed = v
}, { immediate: true })

function openCompose() {
  if (accountsStore.accounts.length === 0) return
  showCompose.value = true
}

function closeCompose() {
  showCompose.value = false
}

const addColumnType = ref<'timeline' | 'notifications' | 'search' | 'list' | 'antenna' | 'favorites' | 'clip' | 'user' | 'mentions' | 'channel' | 'specified' | null>(null)

function selectColumnType(type: 'timeline' | 'notifications' | 'search' | 'list' | 'antenna' | 'favorites' | 'clip' | 'user' | 'mentions' | 'channel' | 'specified') {
  addColumnType.value = type
}

function addColumnForAccount(accountId: string) {
  const type = addColumnType.value || 'timeline'
  if (type === 'list') {
    fetchUserLists(accountId)
    return
  }
  if (type === 'antenna') {
    fetchAntennas(accountId)
    return
  }
  if (type === 'clip') {
    fetchClips(accountId)
    return
  }
  if (type === 'channel') {
    fetchChannels(accountId)
    return
  }
  if (type === 'user') {
    addUserAccountId.value = accountId
    return
  }
  if (type === 'favorites' || type === 'mentions' || type === 'specified') {
    const nameMap: Record<string, string> = { favorites: 'Favorites', mentions: 'Mentions', specified: 'Direct' }
    deckStore.addColumn({
      type,
      name: nameMap[type] ?? type,
      width: 330,
      accountId,
      active: true,
    })
    showAddMenu.value = false
    addColumnType.value = null
    return
  }
  deckStore.addColumn({
    type,
    name: null,
    width: 330,
    accountId,
    tl: type === 'timeline' ? 'home' : undefined,
    active: true,
  })
  showAddMenu.value = false
  addColumnType.value = null
}

// List column creation
interface UserListItem { id: string; name: string }
const addListAccountId = ref<string | null>(null)
const userLists = ref<UserListItem[]>([])
const loadingLists = ref(false)

async function fetchUserLists(accountId: string) {
  addListAccountId.value = accountId
  loadingLists.value = true
  try {
    userLists.value = await invoke<UserListItem[]>('api_get_user_lists', { accountId })
  } catch (e) {
    console.error('[deck] failed to fetch user lists:', e)
    userLists.value = []
  } finally {
    loadingLists.value = false
  }
}

function addListColumn(listId: string, listName: string) {
  if (!addListAccountId.value) return
  deckStore.addColumn({
    type: 'list',
    name: listName,
    width: 330,
    accountId: addListAccountId.value,
    listId,
    active: true,
  })
  resetAddMenu()
}

// Antenna column creation
interface AntennaItem { id: string; name: string }
const addAntennaAccountId = ref<string | null>(null)
const antennas = ref<AntennaItem[]>([])
const loadingAntennas = ref(false)

async function fetchAntennas(accountId: string) {
  addAntennaAccountId.value = accountId
  loadingAntennas.value = true
  try {
    antennas.value = await invoke<AntennaItem[]>('api_get_antennas', { accountId })
  } catch (e) {
    console.error('[deck] failed to fetch antennas:', e)
    antennas.value = []
  } finally {
    loadingAntennas.value = false
  }
}

function addAntennaColumn(antennaId: string, antennaName: string) {
  if (!addAntennaAccountId.value) return
  deckStore.addColumn({
    type: 'antenna',
    name: antennaName,
    width: 330,
    accountId: addAntennaAccountId.value,
    antennaId,
    active: true,
  })
  resetAddMenu()
}

// Channel column creation
interface ChannelItem { id: string; name: string }
const addChannelAccountId = ref<string | null>(null)
const channels = ref<ChannelItem[]>([])
const loadingChannels = ref(false)

async function fetchChannels(accountId: string) {
  addChannelAccountId.value = accountId
  loadingChannels.value = true
  try {
    channels.value = await invoke<ChannelItem[]>('api_get_channels', { accountId })
  } catch (e) {
    console.error('[deck] failed to fetch channels:', e)
    channels.value = []
  } finally {
    loadingChannels.value = false
  }
}

function addChannelColumn(channelId: string, channelName: string) {
  if (!addChannelAccountId.value) return
  deckStore.addColumn({
    type: 'channel',
    name: channelName,
    width: 330,
    accountId: addChannelAccountId.value,
    channelId,
    active: true,
  })
  resetAddMenu()
}

// Clip column creation
interface ClipItem { id: string; name: string }
const addClipAccountId = ref<string | null>(null)
const clips = ref<ClipItem[]>([])
const loadingClips = ref(false)

async function fetchClips(accountId: string) {
  addClipAccountId.value = accountId
  loadingClips.value = true
  try {
    clips.value = await invoke<ClipItem[]>('api_get_clips', { accountId })
  } catch (e) {
    console.error('[deck] failed to fetch clips:', e)
    clips.value = []
  } finally {
    loadingClips.value = false
  }
}

function addClipColumn(clipId: string, clipName: string) {
  if (!addClipAccountId.value) return
  deckStore.addColumn({
    type: 'clip',
    name: clipName,
    width: 330,
    accountId: addClipAccountId.value,
    clipId,
    active: true,
  })
  resetAddMenu()
}

// User column creation
const addUserAccountId = ref<string | null>(null)
const userSearchInput = ref('')
const userSearchError = ref<string | null>(null)
const searchingUser = ref(false)

async function searchAndAddUserColumn() {
  if (!addUserAccountId.value || !userSearchInput.value.trim()) return
  const raw = userSearchInput.value.trim().replace(/^@/, '')
  const parts = raw.split('@')
  const username = parts[0] || ''
  const host = parts[1] || null
  if (!username) return

  searchingUser.value = true
  userSearchError.value = null
  try {
    const user = await invoke<{ id: string; username: string; host: string | null }>('api_lookup_user', {
      accountId: addUserAccountId.value,
      username,
      host,
    })
    const displayName = user.host ? `@${user.username}@${user.host}` : `@${user.username}`
    deckStore.addColumn({
      type: 'user',
      name: displayName,
      width: 330,
      accountId: addUserAccountId.value,
      userId: user.id,
      active: true,
    })
    resetAddMenu()
  } catch {
    userSearchError.value = 'User not found'
  } finally {
    searchingUser.value = false
  }
}

function resetAddMenu() {
  showAddMenu.value = false
  addColumnType.value = null
  addListAccountId.value = null
  userLists.value = []
  addAntennaAccountId.value = null
  antennas.value = []
  addChannelAccountId.value = null
  channels.value = []
  addClipAccountId.value = null
  clips.value = []
  addUserAccountId.value = null
  userSearchInput.value = ''
  userSearchError.value = null
}

function toggleAddMenu() {
  showAddMenu.value = !showAddMenu.value
}

function toggleNav() {
  navWidth.value = navCollapsed.value ? DEFAULT_WIDTH : MIN_WIDTH
}

// Account menu
const accountMenuId = ref<string | null>(null)
const accountModes = ref<Record<string, Record<string, boolean>>>({})
const togglingMode = ref(false)
const modeError = ref<string | null>(null)

function toggleAccountMenu(id: string) {
  if (accountMenuId.value === id) {
    accountMenuId.value = null
    return
  }
  accountMenuId.value = id
  modeError.value = null
  loadAccountModes(id)
  requestAnimationFrame(() => {
    document.addEventListener('click', closeAccountMenu, { once: true })
  })
}

function closeAccountMenu() {
  accountMenuId.value = null
}

async function loadAccountModes(id: string) {
  try {
    const result = await detectAvailableTimelines(id)
    accountModes.value = { ...accountModes.value, [id]: result.modes }
  } catch {
    // non-critical
  }
}

async function toggleAccountMode(accountId: string, key: string) {
  togglingMode.value = true
  modeError.value = null
  try {
    const modes = accountModes.value[accountId] ?? {}
    const newValue = !modes[key]
    await invoke('api_update_user_setting', { accountId, key, value: newValue })
    accountModes.value = {
      ...accountModes.value,
      [accountId]: { ...modes, [key]: newValue },
    }
    clearAvailableTlCache(accountId)
    accountsStore.bumpModeVersion()
  } catch (e) {
    const err = AppError.from(e)
    if (err.isAuth || String(err.message).includes('permission')) {
      modeError.value =
        'Permission denied. Try re-logging in to grant write:account.'
    } else {
      modeError.value = err.message
    }
  } finally {
    togglingMode.value = false
  }
}

function logout(id: string) {
  // Remove all columns for this account
  for (const col of deckStore.columns) {
    if (col.accountId === id) {
      deckStore.removeColumn(col.id)
    }
  }
  accountsStore.removeAccount(id)
  accountMenuId.value = null
}

function modeLabel(key: string): string {
  // isInYamiMode → Yami mode, isInHanamiMode → Hanami mode
  const match = key.match(/^isIn(.+)Mode$/)
  if (!match) return key
  return `${match[1]} mode`
}

// Mobile: track active column for tab bar
const activeColumnIndex = ref(0)
const visibleColumns = computed(() =>
  deckStore.layout.flat().filter((id) => columnMap.value.has(id)),
)

const MOBILE_TAB_ICONS: Record<string, string> = {
  timeline: 'home',
  notifications: 'bell',
  search: 'search',
  list: 'list',
  antenna: 'antenna-bars-5',
  favorites: 'star',
  clip: 'paperclip',
  channel: 'device-tv',
  user: 'user',
  mentions: 'at',
  specified: 'mail',
}

function columnIcon(colId: string): string {
  const col = columnMap.value.get(colId)
  return MOBILE_TAB_ICONS[col?.type ?? ''] ?? MOBILE_TAB_ICONS.timeline ?? ''
}

function onColumnsScroll() {
  if (!columnsRef.value) return
  const w = columnsRef.value.clientWidth
  if (w === 0) return
  activeColumnIndex.value = Math.round(columnsRef.value.scrollLeft / w)
}

function scrollToColumn(index: number) {
  if (!columnsRef.value) return
  columnsRef.value.scrollTo({
    left: index * columnsRef.value.clientWidth,
    behavior: 'smooth',
  })
}

// Wheel deltaY → scrollLeft conversion for horizontal column scrolling
// Only when the cursor is NOT over a column body (let columns scroll vertically)
const columnsRef = ref<HTMLElement | null>(null)
function onColumnsWheel(e: WheelEvent) {
  if (!columnsRef.value) return
  if (Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return
  const target = e.target as HTMLElement | null
  if (target?.closest('.deck-column')) return
  e.preventDefault()
  columnsRef.value.scrollLeft += e.deltaY
}

function toggleFirstAccountMenu() {
  const first = accountsStore.accounts[0]
  if (first) toggleAccountMenu(first.id)
}

function handleResize() {
  if (window.innerWidth <= 1279) {
    navWidth.value = MIN_WIDTH
  } else if (navWidth.value <= MIN_WIDTH) {
    navWidth.value = DEFAULT_WIDTH
  }
}

// Column drag resize
const COL_MIN_WIDTH = 280
const COL_MAX_WIDTH = 600
const resizingColId = ref<string | null>(null)
const resizingColStartX = ref(0)
const resizingColStartW = ref(0)

function startColumnResize(colId: string, e: MouseEvent) {
  e.preventDefault()
  const col = columnMap.value.get(colId)
  if (!col) return
  resizingColId.value = colId
  resizingColStartX.value = e.clientX
  resizingColStartW.value = col.width
  document.body.style.userSelect = 'none'
  document.body.style.cursor = 'col-resize'
  document.addEventListener('mousemove', onColumnResize)
  document.addEventListener('mouseup', stopColumnResize)
}

function onColumnResize(e: MouseEvent) {
  if (!resizingColId.value) return
  const delta = e.clientX - resizingColStartX.value
  const newW = Math.max(
    COL_MIN_WIDTH,
    Math.min(resizingColStartW.value + delta, COL_MAX_WIDTH),
  )
  deckStore.updateColumn(resizingColId.value, { width: newW })
}

function stopColumnResize() {
  resizingColId.value = null
  document.body.style.userSelect = ''
  document.body.style.cursor = ''
  document.removeEventListener('mousemove', onColumnResize)
  document.removeEventListener('mouseup', stopColumnResize)
}

// Navbar drag resize
function startResize(e: MouseEvent) {
  e.preventDefault()
  isResizing.value = true
  document.body.style.userSelect = 'none'
  document.body.style.cursor = 'col-resize'
  document.addEventListener('mousemove', onResize)
  document.addEventListener('mouseup', stopResize)
}

function onResize(e: MouseEvent) {
  const w = e.clientX
  if (w <= COLLAPSE_THRESHOLD) {
    navWidth.value = MIN_WIDTH
  } else {
    navWidth.value = Math.min(w, MAX_WIDTH)
  }
}

function stopResize() {
  isResizing.value = false
  document.body.style.userSelect = ''
  document.body.style.cursor = ''
  document.removeEventListener('mousemove', onResize)
  document.removeEventListener('mouseup', stopResize)
}

onMounted(() => {
  deckStore.load()
  initDesktopNotifications()
  onNotificationAction((ctx) => {
    if (ctx.noteId) {
      router.push(`/note/${ctx.accountId}/${ctx.noteId}`)
    } else if (ctx.userId) {
      router.push(`/user/${ctx.accountId}/${ctx.userId}`)
    }
  })
  registerDefaultCommands({
    openCompose,
    toggleAddMenu,
    toggleNav,
    toggleAccountMenu: toggleFirstAccountMenu,
  })
  window.addEventListener('resize', handleResize)
})

onUnmounted(() => {
  unregisterDefaultCommands()
  window.removeEventListener('resize', handleResize)
})
</script>

<template>
  <div class="deck-root">
    <!-- Left navbar (Misskey style) -->
    <nav class="navbar" :class="{ collapsed: navCollapsed, 'drawer-open': mobileDrawerOpen }" :style="{ flexBasis: navWidth + 'px' }">
      <div class="nav-body">
        <!-- Spacer -->
        <div class="nav-spacer" />

        <!-- Bottom section: post button → accounts -->
        <div class="nav-bottom">
          <!-- Post button -->
          <button
            class="_button nav-post-btn"
            :class="{ collapsed: navCollapsed }"
            title="New Note"
            @click="openCompose"
          >
            <i class="ti ti-pencil" />
            <span class="nav-label">Note</span>
          </button>

          <div class="nav-divider" />

          <!-- Account avatars with dropdown menu -->
          <div
            v-for="acc in accountsStore.accounts"
            :key="acc.id"
            class="nav-account-wrap"
          >
            <button
              class="_button nav-item nav-account"
              :title="`@${acc.username}@${acc.host}`"
              @click.stop="toggleAccountMenu(acc.id)"
            >
              <img
                v-if="acc.avatarUrl"
                :src="acc.avatarUrl"
                class="nav-avatar"
              />
              <div v-else class="nav-avatar nav-avatar-placeholder" />
              <span class="nav-label">@{{ acc.username }}@{{ acc.host }}</span>
            </button>

            <Transition name="nav-account-menu">
              <div
                v-if="accountMenuId === acc.id"
                class="nav-account-menu"
                :class="{ 'menu-right': navCollapsed }"
                @click.stop
              >
                <template v-if="accountModes[acc.id] && Object.keys(accountModes[acc.id] ?? {}).length > 0">
                  <div
                    v-for="(val, key) in accountModes[acc.id]"
                    :key="key"
                    class="nav-account-menu-item"
                    @click="toggleAccountMode(acc.id, key as string)"
                  >
                    <span class="nav-account-menu-label">{{ modeLabel(key as string) }}</span>
                    <button
                      class="nd-filter-toggle"
                      :class="{ on: val }"
                      :disabled="togglingMode"
                      role="switch"
                      :aria-checked="val"
                    >
                      <span class="nd-filter-toggle-knob" />
                    </button>
                  </div>
                </template>
                <div v-if="modeError" class="nav-account-menu-error">{{ modeError }}</div>
                <div class="nav-account-menu-divider" />
                <button class="_button nav-account-menu-item" @click="openUrl(`https://${acc.host}/settings`)">
                  <span>Settings</span>
                  <i class="ti ti-external-link" />
                </button>
                <button class="_button nav-account-menu-item nav-account-logout" @click="logout(acc.id)">
                  <span>Logout</span>
                  <i class="ti ti-logout" />
                </button>
              </div>
            </Transition>
          </div>

          <!-- Add account -->
          <router-link to="/login" class="_button nav-item nav-add-account" title="Add account">
            <i class="ti ti-plus" />
            <span class="nav-label">Add account</span>
          </router-link>
        </div>
      </div>

      <!-- Collapse toggle -->
      <button class="nav-toggle" title="Toggle sidebar" @click="toggleNav">
        <i :class="navCollapsed ? 'ti ti-chevron-right' : 'ti ti-chevron-left'" />
      </button>
    </nav>

    <!-- Resize handle -->
    <div
      class="nav-resize-handle"
      :class="{ active: isResizing }"
      @mousedown="startResize"
    />

    <!-- Main content area -->
    <div class="main-area">
      <!-- Column area -->
      <div
        ref="columnsRef"
        class="columns"
        @wheel="onColumnsWheel"
        @scroll="onColumnsScroll"
      >
        <template v-for="col in resolvedColumns" :key="col.id">
          <section
            class="column-section"
            :style="{ flexBasis: col.width + 'px' }"
            @mousedown="deckStore.setActiveColumn(col.id)"
          >
            <DeckTimelineColumn
              v-if="col.type === 'timeline'"
              :column="col"
            />
            <DeckListColumn
              v-else-if="col.type === 'list'"
              :column="col"
            />
            <DeckAntennaColumn
              v-else-if="col.type === 'antenna'"
              :column="col"
            />
            <DeckNotificationColumn
              v-else-if="col.type === 'notifications'"
              :column="col"
            />
            <DeckSearchColumn
              v-else-if="col.type === 'search'"
              :column="col"
            />
            <DeckFavoritesColumn
              v-else-if="col.type === 'favorites'"
              :column="col"
            />
            <DeckClipColumn
              v-else-if="col.type === 'clip'"
              :column="col"
            />
            <DeckChannelColumn
              v-else-if="col.type === 'channel'"
              :column="col"
            />
            <DeckUserColumn
              v-else-if="col.type === 'user'"
              :column="col"
            />
            <DeckMentionsColumn
              v-else-if="col.type === 'mentions'"
              :column="col"
            />
            <DeckSpecifiedColumn
              v-else-if="col.type === 'specified'"
              :column="col"
            />
          </section>
          <div
            class="col-resize-handle"
            :class="{ active: resizingColId === col.id }"
            @mousedown="startColumnResize(col.id, $event)"
          />
        </template>
      </div>

      <!-- Bottom bar (column management) -->
      <div class="bottom-bar">
        <div class="bottom-bar-left" />
        <button class="_button bottom-bar-btn" title="Add column" @click="toggleAddMenu">
          <i class="ti ti-plus" />
        </button>
        <div class="bottom-bar-right" />
      </div>
    </div>

    <!-- Mobile FAB (visible only on small screens via CSS) -->
    <button class="_button mobile-fab" title="New Note" @click="openCompose">
      <i class="ti ti-pencil" />
    </button>

    <!-- Mobile drawer overlay -->
    <Transition name="fade">
      <div v-if="mobileDrawerOpen" class="mobile-drawer-overlay" @click="mobileDrawerOpen = false" />
    </Transition>

    <!-- Mobile bottom nav (visible only on small screens via CSS) -->
    <nav class="mobile-nav">
      <button class="_button mobile-tab mobile-menu-btn" @click="mobileDrawerOpen = !mobileDrawerOpen">
        <i class="ti ti-menu-2" />
      </button>
      <button
        v-for="(colId, i) in visibleColumns"
        :key="colId"
        class="_button mobile-tab"
        :class="{ active: activeColumnIndex === i }"
        @click="scrollToColumn(i)"
      >
        <i :class="'ti ti-' + columnIcon(colId)" />
      </button>
      <button class="_button mobile-tab" title="Add column" @click="toggleAddMenu">
        <i class="ti ti-plus" />
      </button>
    </nav>

    <!-- Add column popup -->
    <Teleport to="body">
      <div v-if="showAddMenu" class="add-overlay" @click="resetAddMenu()">
        <div class="add-popup" @click.stop>
          <div class="add-popup-header">
            <button v-if="addColumnType && !addListAccountId && !addAntennaAccountId && !addChannelAccountId && !addClipAccountId && !addUserAccountId" class="_button add-back-btn" @click="addColumnType = null">
              <i class="ti ti-chevron-left" />
            </button>
            <button v-else-if="addListAccountId" class="_button add-back-btn" @click="addListAccountId = null; userLists = []">
              <i class="ti ti-chevron-left" />
            </button>
            <button v-else-if="addAntennaAccountId" class="_button add-back-btn" @click="addAntennaAccountId = null; antennas = []">
              <i class="ti ti-chevron-left" />
            </button>
            <button v-else-if="addChannelAccountId" class="_button add-back-btn" @click="addChannelAccountId = null; channels = []">
              <i class="ti ti-chevron-left" />
            </button>
            <button v-else-if="addClipAccountId" class="_button add-back-btn" @click="addClipAccountId = null; clips = []">
              <i class="ti ti-chevron-left" />
            </button>
            <button v-else-if="addUserAccountId" class="_button add-back-btn" @click="addUserAccountId = null; userSearchInput = ''; userSearchError = null">
              <i class="ti ti-chevron-left" />
            </button>
            {{ addListAccountId ? 'Select list' : addAntennaAccountId ? 'Select antenna' : addChannelAccountId ? 'Select channel' : addClipAccountId ? 'Select clip' : addUserAccountId ? 'Find user' : addColumnType ? 'Select account' : 'Add column' }}
          </div>

          <!-- Step 1: Column type selection -->
          <template v-if="!addColumnType">
            <button class="_button add-type-btn" @click="selectColumnType('timeline')">
              <i class="ti ti-home" />
              <span>Timeline</span>
            </button>
            <button class="_button add-type-btn" @click="selectColumnType('list')">
              <i class="ti ti-list" />
              <span>List</span>
            </button>
            <button class="_button add-type-btn" @click="selectColumnType('antenna')">
              <i class="ti ti-antenna-bars-5" />
              <span>Antenna</span>
            </button>
            <button class="_button add-type-btn" @click="selectColumnType('channel')">
              <i class="ti ti-device-tv" />
              <span>Channel</span>
            </button>
            <button class="_button add-type-btn" @click="selectColumnType('notifications')">
              <i class="ti ti-bell" />
              <span>Notifications</span>
            </button>
            <button class="_button add-type-btn" @click="selectColumnType('search')">
              <i class="ti ti-search" />
              <span>Search</span>
            </button>
            <button class="_button add-type-btn" @click="selectColumnType('favorites')">
              <i class="ti ti-star" />
              <span>Favorites</span>
            </button>
            <button class="_button add-type-btn" @click="selectColumnType('clip')">
              <i class="ti ti-paperclip" />
              <span>Clip</span>
            </button>
            <button class="_button add-type-btn" @click="selectColumnType('user')">
              <i class="ti ti-user" />
              <span>User</span>
            </button>
            <button class="_button add-type-btn" @click="selectColumnType('mentions')">
              <i class="ti ti-at" />
              <span>Mentions</span>
            </button>
            <button class="_button add-type-btn" @click="selectColumnType('specified')">
              <i class="ti ti-mail" />
              <span>Direct</span>
            </button>
          </template>

          <!-- Step 3a: List selection (for list columns) -->
          <template v-else-if="addListAccountId">
            <div v-if="loadingLists" class="add-popup-empty">Loading...</div>
            <div v-else-if="userLists.length === 0" class="add-popup-empty">No lists found.</div>
            <button
              v-for="list in userLists"
              :key="list.id"
              class="_button add-type-btn"
              @click="addListColumn(list.id, list.name)"
            >
              <i class="ti ti-list" />
              <span>{{ list.name }}</span>
            </button>
          </template>

          <!-- Step 3b: Antenna selection (for antenna columns) -->
          <template v-else-if="addAntennaAccountId">
            <div v-if="loadingAntennas" class="add-popup-empty">Loading...</div>
            <div v-else-if="antennas.length === 0" class="add-popup-empty">No antennas found.</div>
            <button
              v-for="ant in antennas"
              :key="ant.id"
              class="_button add-type-btn"
              @click="addAntennaColumn(ant.id, ant.name)"
            >
              <i class="ti ti-antenna-bars-5" />
              <span>{{ ant.name }}</span>
            </button>
          </template>

          <!-- Step 3b2: Channel selection (for channel columns) -->
          <template v-else-if="addChannelAccountId">
            <div v-if="loadingChannels" class="add-popup-empty">Loading...</div>
            <div v-else-if="channels.length === 0" class="add-popup-empty">No channels found.</div>
            <button
              v-for="ch in channels"
              :key="ch.id"
              class="_button add-type-btn"
              @click="addChannelColumn(ch.id, ch.name)"
            >
              <i class="ti ti-device-tv" />
              <span>{{ ch.name }}</span>
            </button>
          </template>

          <!-- Step 3c: Clip selection (for clip columns) -->
          <template v-else-if="addClipAccountId">
            <div v-if="loadingClips" class="add-popup-empty">Loading...</div>
            <div v-else-if="clips.length === 0" class="add-popup-empty">No clips found.</div>
            <button
              v-for="clip in clips"
              :key="clip.id"
              class="_button add-type-btn"
              @click="addClipColumn(clip.id, clip.name)"
            >
              <i class="ti ti-paperclip" />
              <span>{{ clip.name }}</span>
            </button>
          </template>

          <!-- Step 3d: User search (for user columns) -->
          <template v-else-if="addUserAccountId">
            <div class="add-user-search">
              <input
                v-model="userSearchInput"
                class="add-user-input"
                type="text"
                placeholder="@username or @username@host"
                @keydown.enter="searchAndAddUserColumn"
              />
              <button
                class="_button add-user-submit"
                :disabled="searchingUser || !userSearchInput.trim()"
                @click="searchAndAddUserColumn"
              >
                {{ searchingUser ? '...' : 'Add' }}
              </button>
            </div>
            <div v-if="userSearchError" class="add-popup-empty" style="color: var(--nd-love);">
              {{ userSearchError }}
            </div>
          </template>

          <!-- Step 2: Account selection -->
          <template v-else>
            <div v-if="accountsStore.accounts.length === 0" class="add-popup-empty">
              No accounts registered.
              <router-link to="/login" @click="resetAddMenu()">
                Add account
              </router-link>
            </div>

            <button
              v-for="account in accountsStore.accounts"
              :key="account.id"
              class="_button add-account-btn"
              @click="addColumnForAccount(account.id)"
            >
              <img v-if="account.avatarUrl" :src="account.avatarUrl" class="add-account-avatar" />
              <span>@{{ account.username }}@{{ account.host }}</span>
            </button>
          </template>
        </div>
      </div>
    </Teleport>

    <Teleport to="body">
      <MkPostForm
        v-if="showCompose && accountsStore.accounts.length > 0"
        :account-id="accountsStore.accounts[0]!.id"
        @close="closeCompose"
        @posted="closeCompose"
      />
    </Teleport>
  </div>
</template>

<style scoped>
.deck-root {
  display: flex;
  width: 100%;
  height: 100%;
  background: var(--nd-deckBg);
}

/* ============================================================
   Left Navbar
   ============================================================ */
.navbar {
  flex: 0 0 auto;
  display: flex;
  background: color-mix(in srgb, var(--nd-navBg) 80%, transparent);
  backdrop-filter: blur(15px);
  -webkit-backdrop-filter: blur(15px);
  border-right: 1px solid var(--nd-divider);
  position: relative;
}

.nav-body {
  flex: 1;
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow-y: auto;
  overflow-x: hidden;
  direction: rtl;
}

.collapsed .nav-body {
  overflow: visible;
  direction: ltr;
}

.nav-body > * {
  direction: ltr;
}

.nav-top,
.nav-bottom {
  display: flex;
  flex-direction: column;
  padding: 8px;
}

.nav-spacer {
  flex: 1;
}

.nav-divider {
  height: 1px;
  background: var(--nd-divider);
  margin: 4px 10px;
}

.nav-item {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 8px 14px;
  border-radius: 8px;
  color: var(--nd-navFg, var(--nd-fg));
  font-size: 0.9em;
  white-space: nowrap;
  text-decoration: none;
  transition: background 0.15s, color 0.15s;
}

.nav-item:hover {
  background: var(--nd-buttonHoverBg);
  color: var(--nd-fgHighlighted);
}

.nav-item .ti {
  flex-shrink: 0;
  opacity: 0.8;
}

.nav-item:hover .ti {
  opacity: 1;
}

.nav-label {
  overflow: hidden;
  text-overflow: ellipsis;
}

.collapsed .nav-label {
  display: none;
}

.collapsed .nav-item {
  justify-content: center;
  padding: 10px 0;
  width: 100%;
}

.collapsed .nav-top,
.collapsed .nav-bottom {
  padding: 8px 0;
  align-items: center;
}

/* Account in nav */
.nav-account {
  gap: 10px;
}

.nav-avatar {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  object-fit: cover;
  flex-shrink: 0;
}

.collapsed .nav-avatar {
  width: 34px;
  height: 34px;
}

.nav-avatar-placeholder {
  background: var(--nd-buttonBg);
}

/* Add account button */
.nav-add-account {
  opacity: 0.5;
  font-size: 0.8em;
}

.nav-add-account:hover {
  opacity: 0.8;
}

.nav-add-account .ti {
  font-size: 16px;
}

/* Post button (prominent) */
.nav-post-btn {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 10px 14px;
  border-radius: 999px;
  background: linear-gradient(90deg, var(--nd-buttonGradateA, var(--nd-accent)), var(--nd-buttonGradateB, var(--nd-accentDarken)));
  color: var(--nd-fgOnAccent, #fff);
  font-weight: bold;
  font-size: 0.9em;
  white-space: nowrap;
  transition: transform 0.15s, box-shadow 0.15s;
}

.nav-post-btn:hover {
  transform: scale(1.03);
  box-shadow: 0 4px 12px rgba(134, 179, 0, 0.3);
}

.nav-post-btn:active {
  transform: scale(0.97);
}

.nav-post-btn.collapsed {
  width: 44px;
  height: 44px;
  padding: 0;
  margin: 0 auto;
  border-radius: 50%;
  justify-content: center;
}

/* Nav resize handle */
.nav-resize-handle {
  flex: 0 0 6px;
  cursor: col-resize;
  background: transparent;
  transition: background 0.15s;
  z-index: 10;
}

.nav-resize-handle:hover,
.nav-resize-handle.active {
  background: var(--nd-accent);
  opacity: 0.4;
}

.nav-resize-handle.active {
  opacity: 0.6;
}

/* Nav toggle button */
.nav-toggle {
  position: absolute;
  right: 0;
  top: 50%;
  transform: translateY(-50%) translateX(50%);
  display: flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 40px;
  border-radius: 0 6px 6px 0;
  background: var(--nd-panel);
  border: 1px solid var(--nd-divider);
  border-left: none;
  color: var(--nd-fg);
  opacity: 0;
  cursor: pointer;
  transition: opacity 0.15s;
  z-index: 10;
}

.deck-root:hover .nav-toggle {
  opacity: 0.5;
}

.nav-toggle:hover {
  opacity: 1 !important;
}

/* ============================================================
   Main area (columns + bottom bar)
   ============================================================ */
.main-area {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.columns {
  flex: 1;
  display: flex;
  gap: var(--nd-columnGap);
  padding: var(--nd-columnGap);
  overflow-x: auto;
  overflow-y: clip;
  overscroll-behavior: contain;
  min-width: 0;
  min-height: 0;
}

.column-section {
  flex: 0 0 auto;
  min-width: 280px;
  max-width: 600px;
  height: 100%;
}

.col-resize-handle {
  flex: 0 0 4px;
  cursor: col-resize;
  background: transparent;
  transition: background 0.15s;
}

.col-resize-handle:hover,
.col-resize-handle.active {
  background: var(--nd-accent);
  opacity: 0.4;
}

.col-resize-handle.active {
  opacity: 0.6;
}

/* ============================================================
   Bottom bar (column management)
   ============================================================ */
.bottom-bar {
  flex: 0 0 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--nd-navBg);
  border-top: 1px solid var(--nd-divider);
}

.bottom-bar-left {
  flex: 1;
}

.bottom-bar-right {
  flex: 1;
  display: flex;
  justify-content: flex-end;
}

.bottom-bar-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  aspect-ratio: 1;
  color: var(--nd-fg);
  opacity: 0.5;
  transition: opacity 0.15s, background 0.15s;
}

.bottom-bar-btn:hover {
  opacity: 1;
  background: var(--nd-buttonHoverBg);
}

/* ============================================================
   Add column popup
   ============================================================ */
.add-overlay {
  position: fixed;
  inset: 0;
  z-index: 1000;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--nd-modalBg);
}

.add-popup {
  background: var(--nd-popup);
  border-radius: 16px;
  box-shadow: 0 8px 32px var(--nd-shadow);
  min-width: 320px;
  max-width: 480px;
  max-height: 80vh;
  overflow-y: auto;
}

.add-popup-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 20px 24px 16px;
  font-size: 1em;
  font-weight: bold;
  border-bottom: 1px solid var(--nd-divider);
}

.add-popup-empty {
  padding: 2rem;
  text-align: center;
  color: var(--nd-fg);
  opacity: 0.6;
  font-size: 0.9em;
}

.add-popup-empty a {
  color: var(--nd-accent);
}

.add-user-search {
  display: flex;
  gap: 8px;
  padding: 12px 16px;
}

.add-user-input {
  flex: 1;
  padding: 8px 12px;
  border: 1px solid var(--nd-divider);
  border-radius: 6px;
  background: var(--nd-bg);
  color: var(--nd-fg);
  font-size: 0.85em;
  outline: none;
}

.add-user-input:focus {
  border-color: var(--nd-accent);
}

.add-user-submit {
  padding: 8px 16px;
  border-radius: 6px;
  background: var(--nd-accent);
  color: #fff;
  font-size: 0.85em;
  font-weight: bold;
  cursor: pointer;
}

.add-user-submit:disabled {
  opacity: 0.5;
  cursor: default;
}

.add-account-btn {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 12px 24px;
  font-size: 0.85em;
  font-weight: bold;
  color: var(--nd-fgHighlighted);
  transition: background 0.15s;
}

.add-account-btn:hover {
  background: var(--nd-buttonHoverBg);
}

.add-account-btn + .add-account-btn {
  border-top: 1px solid var(--nd-divider);
}

.add-account-avatar {
  width: 28px;
  height: 28px;
  border-radius: 50%;
}

.add-back-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border-radius: 6px;
  opacity: 0.7;
  transition: background 0.15s, opacity 0.15s;
}

.add-back-btn:hover {
  background: var(--nd-buttonHoverBg);
  opacity: 1;
}

.add-type-btn {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  padding: 14px 24px;
  font-size: 0.9em;
  font-weight: bold;
  color: var(--nd-fgHighlighted);
  transition: background 0.15s;
}

.add-type-btn:hover {
  background: var(--nd-buttonHoverBg);
}

.add-type-btn + .add-type-btn {
  border-top: 1px solid var(--nd-divider);
}

.add-type-btn .ti {
  opacity: 0.7;
  font-size: 18px;
}

/* ============================================================
   Account dropdown menu
   ============================================================ */
.nav-account-wrap {
  position: relative;
}

.nav-account-menu {
  position: absolute;
  bottom: 100%;
  left: 0;
  right: 0;
  margin-bottom: 4px;
  background: color-mix(in srgb, var(--nd-popup, var(--nd-panelBg)) 85%, transparent);
  border-radius: 12px;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.15);
  backdrop-filter: blur(16px);
  padding: 8px 0;
  z-index: 100;
  min-width: 180px;
}

.nav-account-menu.menu-right {
  bottom: auto;
  top: 0;
  left: 100%;
  right: auto;
  margin-bottom: 0;
  margin-left: 4px;
}

.nav-account-menu-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 8px 14px;
  cursor: pointer;
  transition: background 0.1s;
  font-size: 0.85em;
  color: var(--nd-fg);
  width: 100%;
  text-align: left;
}

.nav-account-menu-item:hover {
  background: var(--nd-buttonHoverBg);
}

.nav-account-menu-label {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.nav-account-menu-divider {
  height: 1px;
  background: var(--nd-divider);
  margin: 4px 10px;
}

.nav-account-menu-error {
  padding: 6px 14px;
  font-size: 0.75em;
  color: var(--nd-love);
  word-break: break-word;
}

.nav-account-logout {
  color: var(--nd-love, #ff6b6b);
  gap: 8px;
}

.nav-account-logout .ti {
  flex-shrink: 0;
  opacity: 0.8;
}

.nav-account-menu-enter-active,
.nav-account-menu-leave-active {
  transition: opacity 0.15s, transform 0.15s;
}

.nav-account-menu-enter-from,
.nav-account-menu-leave-to {
  opacity: 0;
  transform: translateY(4px);
}

.nav-account-menu.menu-right.nav-account-menu-enter-from,
.nav-account-menu.menu-right.nav-account-menu-leave-to {
  transform: translateX(-4px);
}

/* ============================================================
   Mobile nav (hidden on desktop)
   ============================================================ */
.mobile-nav,
.mobile-fab {
  display: none;
}

@media (max-width: 500px) {
  .nav-resize-handle,
  .nav-toggle,
  .col-resize-handle,
  .bottom-bar {
    display: none !important;
  }

  .navbar {
    display: flex !important;
    position: fixed;
    top: env(safe-area-inset-top);
    left: 0;
    bottom: env(safe-area-inset-bottom);
    z-index: 2000;
    width: 250px !important;
    flex-basis: 250px !important;
    transform: translateX(-100%);
    transition: transform 0.25s ease;
    box-shadow: none;
  }

  .navbar.drawer-open {
    transform: translateX(0);
    box-shadow: 4px 0 16px rgb(0 0 0 / 0.3);
  }

  /* Override collapsed styles when drawer is open */
  .navbar.drawer-open .nav-label {
    display: inline !important;
  }

  .navbar.drawer-open .nav-body {
    overflow-y: auto;
    direction: rtl;
  }

  .navbar.drawer-open .nav-item {
    justify-content: flex-start;
    padding: 12px 14px;
    width: auto;
  }

  .navbar.drawer-open .nav-top,
  .navbar.drawer-open .nav-bottom {
    padding: 8px;
    align-items: stretch;
  }

  .navbar.drawer-open .nav-post-btn {
    width: 100%;
    height: auto;
    padding: 10px 14px;
    margin: 0;
    border-radius: 999px;
  }

  .mobile-drawer-overlay {
    position: fixed;
    inset: 0;
    z-index: 1999;
    background: rgb(0 0 0 / 0.5);
  }

  .fade-enter-active,
  .fade-leave-active {
    transition: opacity 0.25s ease;
  }

  .fade-enter-from,
  .fade-leave-to {
    opacity: 0;
  }

  .mobile-menu-btn {
    flex: 0 0 auto !important;
    width: 50px;
  }

  .deck-root {
    flex-direction: column;
  }

  .main-area {
    min-height: 0;
  }

  .columns {
    scroll-snap-type: x mandatory;
    gap: 0;
    padding: 0;
  }

  .column-section {
    flex: 0 0 100% !important;
    min-width: 100% !important;
    max-width: 100% !important;
    scroll-snap-align: start;
  }

  .mobile-fab {
    display: flex;
    align-items: center;
    justify-content: center;
    position: fixed;
    right: 16px;
    bottom: calc(66px + env(safe-area-inset-bottom));
    z-index: 1000;
    width: 56px;
    height: 56px;
    border-radius: 50%;
    background: linear-gradient(
      90deg,
      var(--nd-buttonGradateA, var(--nd-accent)),
      var(--nd-buttonGradateB, var(--nd-accentDarken))
    );
    color: var(--nd-fgOnAccent, #fff);
    box-shadow: 0 4px 12px rgb(0 0 0 / 0.3);
  }

  .mobile-fab:hover {
    transform: scale(1.05);
  }

  .mobile-fab:active {
    transform: scale(0.92);
  }

  .mobile-nav {
    display: flex;
    align-items: stretch;
    flex: 0 0 auto;
    height: 56px;
    padding-bottom: env(safe-area-inset-bottom);
    background: var(--nd-navBg);
    border-top: 1px solid var(--nd-divider);
  }

  .mobile-tab {
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
    flex: 1;
    height: 56px;
    color: var(--nd-fg);
    opacity: 0.45;
    transition: opacity 0.2s, color 0.2s;
  }

  .mobile-tab.active {
    opacity: 1;
    color: var(--nd-accent);
  }

  .mobile-tab.active::after {
    content: "";
    position: absolute;
    bottom: 0;
    left: 50%;
    transform: translateX(-50%);
    width: 24px;
    height: 3px;
    border-radius: 3px 3px 0 0;
    background: var(--nd-accent);
  }

  .mobile-tab:active {
    opacity: 0.7;
  }

  .add-popup {
    min-width: auto;
    width: calc(100% - 32px);
    max-width: 480px;
  }
}
</style>
