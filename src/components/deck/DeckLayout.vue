<script setup lang="ts">
import { invoke } from '@tauri-apps/api/core'
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import MkPostForm from '@/components/common/MkPostForm.vue'
import { useGlobalShortcuts } from '@/composables/useGlobalShortcuts'
import { useAccountsStore } from '@/stores/accounts'
import type { DeckColumn } from '@/stores/deck'
import { useDeckStore } from '@/stores/deck'
import { useThemeStore } from '@/stores/theme'
import { DARK_THEME, LIGHT_THEME } from '@/theme/builtinThemes'
import {
  clearAvailableTlCache,
  detectAvailableTimelines,
} from '@/utils/customTimelines'
import {
  initDesktopNotifications,
  onNotificationAction,
} from '@/utils/desktopNotification'
import { AppError } from '@/utils/errors'
import DeckNotificationColumn from './DeckNotificationColumn.vue'
import DeckSearchColumn from './DeckSearchColumn.vue'
import DeckTimelineColumn from './DeckTimelineColumn.vue'

const router = useRouter()
const deckStore = useDeckStore()
const accountsStore = useAccountsStore()
const themeStore = useThemeStore()

const isDark = computed(() => !themeStore.currentSource?.kind.includes('light'))

function toggleTheme() {
  if (isDark.value) {
    themeStore.applySource({ kind: 'builtin-light', theme: LIGHT_THEME })
  } else {
    themeStore.applySource({ kind: 'builtin-dark', theme: DARK_THEME })
  }
}

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

function openCompose() {
  if (accountsStore.accounts.length === 0) return
  showCompose.value = true
}

function closeCompose() {
  showCompose.value = false
}

const addColumnType = ref<'timeline' | 'notifications' | 'search' | null>(null)

function selectColumnType(type: 'timeline' | 'notifications' | 'search') {
  addColumnType.value = type
}

function addColumnForAccount(accountId: string) {
  const type = addColumnType.value || 'timeline'
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

function addColumnViaNav(type: 'timeline' | 'notifications' | 'search') {
  const accounts = accountsStore.accounts
  if (accounts.length === 0) return
  const single = accounts.length === 1 ? accounts[0] : undefined
  if (single) {
    addColumnType.value = null
    deckStore.addColumn({
      type,
      name: null,
      width: 330,
      accountId: single.id,
      tl: type === 'timeline' ? 'home' : undefined,
      active: true,
    })
    return
  }
  selectColumnType(type)
  showAddMenu.value = true
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
  timeline:
    'M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 01-1-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 01-1 1m-2 0h2',
  notifications:
    'M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9M13.73 21a2 2 0 0 1-3.46 0',
  search: 'M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z',
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

const { init: initShortcuts } = useGlobalShortcuts({
  onCompose: () => openCompose(),
})

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
  initShortcuts()
  window.addEventListener('resize', handleResize)
})

onUnmounted(() => {
  window.removeEventListener('resize', handleResize)
})
</script>

<template>
  <div class="deck-root">
    <!-- Left navbar (Misskey style) -->
    <nav class="navbar" :class="{ collapsed: navCollapsed, 'drawer-open': mobileDrawerOpen }" :style="{ flexBasis: navWidth + 'px' }">
      <div class="nav-body">
        <!-- Top section: nav links -->
        <div class="nav-top">
          <button class="_button nav-item" title="Home" @click="router.push('/')">
            <svg viewBox="0 0 24 24" width="20" height="20">
              <path d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"
                stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" fill="none" />
            </svg>
            <span class="nav-label">Timeline</span>
          </button>

          <button class="_button nav-item" title="Search" @click="addColumnViaNav('search')">
            <svg viewBox="0 0 24 24" width="20" height="20">
              <path d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                stroke="currentColor" stroke-width="2" stroke-linecap="round" fill="none" />
            </svg>
            <span class="nav-label">Search</span>
          </button>

          <button class="_button nav-item" title="Notifications" @click="addColumnViaNav('notifications')">
            <svg viewBox="0 0 24 24" width="20" height="20">
              <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9M13.73 21a2 2 0 0 1-3.46 0"
                stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" fill="none" />
            </svg>
            <span class="nav-label">Notifications</span>
          </button>

          <button class="_button nav-item" :title="isDark ? 'Light theme' : 'Dark theme'" @click="toggleTheme">
            <!-- Sun icon (shown in dark mode → click to go light) -->
            <svg v-if="isDark" viewBox="0 0 24 24" width="20" height="20">
              <circle cx="12" cy="12" r="5" stroke="currentColor" stroke-width="2" fill="none" />
              <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"
                stroke="currentColor" stroke-width="2" stroke-linecap="round" fill="none" />
            </svg>
            <!-- Moon icon (shown in light mode → click to go dark) -->
            <svg v-else viewBox="0 0 24 24" width="20" height="20">
              <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"
                stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" fill="none" />
            </svg>
            <span class="nav-label">{{ isDark ? 'Light theme' : 'Dark theme' }}</span>
          </button>
        </div>

        <!-- Middle spacer -->
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
            <svg viewBox="0 0 24 24" width="20" height="20">
              <path
                d="M12 20h9M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"
                stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" fill="none"
              />
            </svg>
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
                <button class="_button nav-account-menu-item nav-account-logout" @click="logout(acc.id)">
                  <span>Logout</span>
                  <svg viewBox="0 0 24 24" width="16" height="16">
                    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"
                      stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" fill="none" />
                  </svg>
                </button>
              </div>
            </Transition>
          </div>

          <!-- Add account -->
          <router-link to="/login" class="_button nav-item nav-add-account" title="Add account">
            <svg viewBox="0 0 24 24" width="20" height="20">
              <path d="M12 4v16M4 12h16" stroke="currentColor" stroke-width="2" stroke-linecap="round" fill="none" />
            </svg>
            <span class="nav-label">Add account</span>
          </router-link>
        </div>
      </div>

      <!-- Collapse toggle -->
      <button class="nav-toggle" title="Toggle sidebar" @click="toggleNav">
        <svg viewBox="0 0 24 24" width="14" height="14">
          <path
            :d="navCollapsed ? 'M9 18l6-6-6-6' : 'M15 18l-6-6 6-6'"
            stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" fill="none"
          />
        </svg>
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
          >
            <DeckTimelineColumn
              v-if="col.type === 'timeline'"
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
          <svg viewBox="0 0 24 24" width="16" height="16">
            <path d="M12 4v16M4 12h16" stroke="currentColor" stroke-width="2" stroke-linecap="round" fill="none" />
          </svg>
        </button>
        <div class="bottom-bar-right" />
      </div>
    </div>

    <!-- Mobile FAB (visible only on small screens via CSS) -->
    <button class="_button mobile-fab" title="New Note" @click="openCompose">
      <svg viewBox="0 0 24 24" width="24" height="24">
        <path d="M12 20h9M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"
          stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" fill="none" />
      </svg>
    </button>

    <!-- Mobile drawer overlay -->
    <Transition name="fade">
      <div v-if="mobileDrawerOpen" class="mobile-drawer-overlay" @click="mobileDrawerOpen = false" />
    </Transition>

    <!-- Mobile bottom nav (visible only on small screens via CSS) -->
    <nav class="mobile-nav">
      <button class="_button mobile-tab mobile-menu-btn" @click="mobileDrawerOpen = !mobileDrawerOpen">
        <svg viewBox="0 0 24 24" width="24" height="24">
          <path d="M4 6h16M4 12h16M4 18h16" stroke="currentColor" stroke-width="2" stroke-linecap="round" fill="none" />
        </svg>
      </button>
      <button
        v-for="(colId, i) in visibleColumns"
        :key="colId"
        class="_button mobile-tab"
        :class="{ active: activeColumnIndex === i }"
        @click="scrollToColumn(i)"
      >
        <svg viewBox="0 0 24 24" width="24" height="24">
          <path :d="columnIcon(colId)" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" fill="none" />
        </svg>
      </button>
      <button class="_button mobile-tab" title="Add column" @click="toggleAddMenu">
        <svg viewBox="0 0 24 24" width="24" height="24">
          <path d="M12 4v16M4 12h16" stroke="currentColor" stroke-width="2" stroke-linecap="round" fill="none" />
        </svg>
      </button>
    </nav>

    <!-- Add column popup -->
    <Teleport to="body">
      <div v-if="showAddMenu" class="add-overlay" @click="showAddMenu = false; addColumnType = null">
        <div class="add-popup" @click.stop>
          <div class="add-popup-header">
            <button v-if="addColumnType" class="_button add-back-btn" @click="addColumnType = null">
              <svg viewBox="0 0 24 24" width="16" height="16">
                <path d="M15 18l-6-6 6-6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" fill="none" />
              </svg>
            </button>
            {{ addColumnType ? 'Select account' : 'Add column' }}
          </div>

          <!-- Step 1: Column type selection -->
          <template v-if="!addColumnType">
            <button class="_button add-type-btn" @click="selectColumnType('timeline')">
              <svg viewBox="0 0 24 24" width="18" height="18">
                <path d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 01-1-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 01-1 1m-2 0h2"
                  stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" fill="none" />
              </svg>
              <span>Timeline</span>
            </button>
            <button class="_button add-type-btn" @click="selectColumnType('notifications')">
              <svg viewBox="0 0 24 24" width="18" height="18">
                <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9M13.73 21a2 2 0 0 1-3.46 0"
                  stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" fill="none" />
              </svg>
              <span>Notifications</span>
            </button>
            <button class="_button add-type-btn" @click="selectColumnType('search')">
              <svg viewBox="0 0 24 24" width="18" height="18">
                <path d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                  stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" fill="none" />
              </svg>
              <span>Search</span>
            </button>
          </template>

          <!-- Step 2: Account selection -->
          <template v-else>
            <div v-if="accountsStore.accounts.length === 0" class="add-popup-empty">
              No accounts registered.
              <router-link to="/login" @click="showAddMenu = false; addColumnType = null">
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
  background: var(--nd-navBg);
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
  padding: 12px 14px;
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

.nav-item svg {
  flex-shrink: 0;
  opacity: 0.8;
}

.nav-item:hover svg {
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
  padding: 14px 0;
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

.nav-add-account svg {
  width: 16px;
  height: 16px;
}

/* Post button (prominent) */
.nav-post-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  width: 100%;
  padding: 10px 14px;
  border-radius: 999px;
  background: linear-gradient(90deg, var(--nd-buttonGradateA, var(--nd-accent)), var(--nd-buttonGradateB, var(--nd-accentDarken)));
  color: var(--nd-fgOnAccent, #fff);
  font-weight: bold;
  font-size: 0.9em;
  white-space: nowrap;
  transition: opacity 0.15s;
}

.nav-post-btn:hover {
  opacity: 0.85;
}

.nav-post-btn.collapsed {
  width: 44px;
  height: 44px;
  padding: 0;
  margin: 0 auto;
  border-radius: 50%;
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

.add-type-btn svg {
  opacity: 0.7;
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
  background: var(--nd-popup, var(--nd-panelBg));
  border: 1px solid var(--nd-divider);
  border-radius: 10px;
  box-shadow: 0 4px 24px rgba(0, 0, 0, 0.25);
  padding: 6px 0;
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

.nav-account-logout svg {
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
