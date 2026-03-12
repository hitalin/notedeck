<script setup lang="ts">
import { convertFileSrc, invoke } from '@tauri-apps/api/core'
import {
  computed,
  defineAsyncComponent,
  nextTick,
  onMounted,
  onUnmounted,
  ref,
  watch,
} from 'vue'
import { useRouter } from 'vue-router'
import { loadCliCommands } from '@/commands/cliParser'
import {
  registerDefaultCommands,
  unregisterDefaultCommands,
} from '@/commands/definitions'
import { useCommandStore } from '@/commands/registry'
import { useColumnDrag } from '@/composables/useColumnDrag'
import { provideColumnVisibility } from '@/composables/useColumnVisibility'
import { useFileDrop } from '@/composables/useFileDrop'
import { useNavigation } from '@/composables/useNavigation'
import { provideScrollDirection } from '@/composables/useScrollDirection'
import { useUpdater } from '@/composables/useUpdater'
import { useAccountsStore } from '@/stores/accounts'
import type { DeckColumn } from '@/stores/deck'
import { useDeckStore } from '@/stores/deck'
import { usePluginsStore } from '@/stores/plugins'
import { useServersStore } from '@/stores/servers'
import { useUiStore } from '@/stores/ui'
import { destroyApiBridge, initApiBridge } from '@/utils/apiBridge'
import {
  initDesktopNotifications,
  onNotificationAction,
} from '@/utils/desktopNotification'

const MkPostForm = defineAsyncComponent(
  () => import('@/components/common/MkPostForm.vue'),
)
const AddColumnDialog = defineAsyncComponent(
  () => import('./AddColumnDialog.vue'),
)

import type { Component } from 'vue'
import DeckAboutMisskeyColumn from './DeckAboutMisskeyColumn.vue'
import DeckAchievementsColumn from './DeckAchievementsColumn.vue'
import DeckAdsColumn from './DeckAdsColumn.vue'
import DeckAiColumn from './DeckAiColumn.vue'
import DeckAiScriptColumn from './DeckAiScriptColumn.vue'
import DeckAnnouncementsColumn from './DeckAnnouncementsColumn.vue'
import DeckAntennaColumn from './DeckAntennaColumn.vue'
import DeckApiConsoleColumn from './DeckApiConsoleColumn.vue'
import DeckApiDocsColumn from './DeckApiDocsColumn.vue'
import DeckChannelColumn from './DeckChannelColumn.vue'
import DeckChatColumn from './DeckChatColumn.vue'
import DeckClipColumn from './DeckClipColumn.vue'
import DeckDriveColumn from './DeckDriveColumn.vue'
import DeckEmojiColumn from './DeckEmojiColumn.vue'
import DeckExploreColumn from './DeckExploreColumn.vue'
import DeckFavoritesColumn from './DeckFavoritesColumn.vue'
import DeckFollowRequestsColumn from './DeckFollowRequestsColumn.vue'
import DeckGalleryColumn from './DeckGalleryColumn.vue'
import DeckListColumn from './DeckListColumn.vue'
import DeckLookupColumn from './DeckLookupColumn.vue'
import DeckMentionsColumn from './DeckMentionsColumn.vue'
import DeckNavbar from './DeckNavbar.vue'
import DeckNotificationColumn from './DeckNotificationColumn.vue'
import DeckPageColumn from './DeckPageColumn.vue'
import DeckPlayColumn from './DeckPlayColumn.vue'
import DeckProfileMenu from './DeckProfileMenu.vue'
import DeckSearchColumn from './DeckSearchColumn.vue'
import DeckServerInfoColumn from './DeckServerInfoColumn.vue'
import DeckSettingsMenu from './DeckSettingsMenu.vue'
import DeckSpecifiedColumn from './DeckSpecifiedColumn.vue'
import DeckTimelineColumn from './DeckTimelineColumn.vue'
import DeckUserColumn from './DeckUserColumn.vue'
import DeckWidgetColumn from './DeckWidgetColumn.vue'

const COLUMN_COMPONENTS: Record<string, Component> = {
  timeline: DeckTimelineColumn,
  list: DeckListColumn,
  antenna: DeckAntennaColumn,
  notifications: DeckNotificationColumn,
  search: DeckSearchColumn,
  favorites: DeckFavoritesColumn,
  clip: DeckClipColumn,
  channel: DeckChannelColumn,
  user: DeckUserColumn,
  mentions: DeckMentionsColumn,
  specified: DeckSpecifiedColumn,
  chat: DeckChatColumn,
  widget: DeckWidgetColumn,
  aiscript: DeckAiScriptColumn,
  play: DeckPlayColumn,
  page: DeckPageColumn,
  ai: DeckAiColumn,
  drive: DeckDriveColumn,
  announcements: DeckAnnouncementsColumn,
  gallery: DeckGalleryColumn,
  explore: DeckExploreColumn,
  followRequests: DeckFollowRequestsColumn,
  achievements: DeckAchievementsColumn,
  apiConsole: DeckApiConsoleColumn,
  apiDocs: DeckApiDocsColumn,
  lookup: DeckLookupColumn,
  serverInfo: DeckServerInfoColumn,
  ads: DeckAdsColumn,
  aboutMisskey: DeckAboutMisskeyColumn,
  emoji: DeckEmojiColumn,
}

const router = useRouter()
const {
  navigateToNote,
  navigateToUser,
  navigateToSearch,
  navigateToNotifications,
} = useNavigation()
const deckStore = useDeckStore()
const accountsStore = useAccountsStore()
const serversStore = useServersStore()
const pluginsStore = usePluginsStore()
const commandStore = useCommandStore()
const uiStore = useUiStore()
const columnDrag = useColumnDrag(deckStore)
const pendingFilePaths = ref<string[]>([])

const IMAGE_EXTENSIONS = /\.(jpe?g|png|gif|webp|avif|bmp|svg)$/i

const fileDrop = useFileDrop((paths, position) => {
  // If compose form is open, attach files to the post
  if (showCompose.value) {
    pendingFilePaths.value = paths
    return
  }

  // Check what's under the drop position
  const el = document.elementFromPoint(position.x, position.y)
  const columnCell = el?.closest('[data-column-id]') as HTMLElement | null

  if (columnCell) {
    const colId = columnCell.dataset.columnId
    const col = colId ? columnMap.value.get(colId) : undefined
    // Drop on drive column → upload files
    if (col?.type === 'drive' && col.accountId) {
      const accountId = col.accountId
      for (const path of paths) {
        invoke('api_upload_file_from_path', {
          accountId,
          filePath: path,
          isSensitive: false,
        }).then(() => {
          window.dispatchEvent(
            new CustomEvent('drive-files-changed', { detail: { accountId } }),
          )
        })
      }
      return
    }
  }

  // Drop on empty area with image files → set as wallpaper
  if (
    !columnCell &&
    paths.length === 1 &&
    IMAGE_EXTENSIONS.test(paths[0] ?? '')
  ) {
    deckStore.setWallpaper(convertFileSrc(paths[0] ?? ''))
    return
  }
})
// Pre-build column lookup map to avoid O(n) find per column per render
const columnMap = computed(() => {
  const map = new Map<string, DeckColumn>()
  for (const col of deckStore.columns) {
    map.set(col.id, col)
  }
  return map
})

const dropInsertIndex = computed(() => {
  const dt = columnDrag.dropTarget.value
  if (!dt || !('insertIndex' in dt)) return -1
  // Suppress placeholder when inserting at the same position (no-op)
  const dragId = columnDrag.dragColumnId.value
  if (dragId) {
    const fromIdx = deckStore.layout.findIndex((ids) => ids.includes(dragId))
    if (
      fromIdx >= 0 &&
      (dt.insertIndex === fromIdx || dt.insertIndex === fromIdx + 1)
    )
      return -1
  }
  return dt.insertIndex
})

const dropInsertWidth = computed(() => {
  const dragId = columnDrag.dragColumnId.value
  if (!dragId) return 400
  return columnMap.value.get(dragId)?.width ?? 400
})

const navbarRef = ref<InstanceType<typeof DeckNavbar> | null>(null)
const showAddMenu = ref(false)
const showCompose = ref(false)
const showProfileMenu = ref(false)
const showSettingsMenu = ref(false)
const mobileDrawerOpen = ref(false)
const { updateAvailable, checkForUpdate } = useUpdater()

function openCompose() {
  if (accountsStore.accounts.length === 0) return
  showCompose.value = true
}

function closeCompose() {
  showCompose.value = false
  pendingFilePaths.value = []
}

function toggleAddMenu() {
  showAddMenu.value = !showAddMenu.value
}

// Column visibility tracking (pauses streaming for off-screen columns)
const colVisibility = provideColumnVisibility()
provideScrollDirection()

let handleResizeRef: (() => void) | null = null
let unlistenQuickNote: (() => void) | null = null

// Mobile: track active column for tab bar
const activeColumnIndex = ref(0)
const mobileNavRef = ref<HTMLElement | null>(null)

watch(activeColumnIndex, () => {
  nextTick(() => {
    if (!mobileNavRef.value) return
    const tab = mobileNavRef.value.children[activeColumnIndex.value] as
      | HTMLElement
      | undefined
    if (tab) {
      tab.scrollIntoView({
        behavior: 'smooth',
        inline: 'center',
        block: 'nearest',
      })
    }
  })
})
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
  chat: 'messages',
  widget: 'app-window',
  aiscript: 'terminal-2',
  play: 'player-play',
  page: 'note',
  ai: 'sparkles',
  announcements: 'speakerphone',
  drive: 'cloud',
  explore: 'compass',
  gallery: 'icons',
  followRequests: 'user-plus',
  achievements: 'medal',
  apiConsole: 'api',
  lookup: 'world-search',
  serverInfo: 'server',
  ads: 'ad-2',
  aboutMisskey: 'info-circle',
  emoji: 'mood-smile',
}

const TL_ICONS: Record<string, string> = {
  home: 'home',
  local: 'planet',
  social: 'rocket',
  global: 'whirl',
}

function columnIcon(colId: string): string {
  const col = columnMap.value.get(colId)
  if (!col) return MOBILE_TAB_ICONS.timeline ?? ''
  if (col.type === 'timeline' && col.tl) {
    return TL_ICONS[col.tl] ?? MOBILE_TAB_ICONS.timeline ?? ''
  }
  return MOBILE_TAB_ICONS[col.type] ?? MOBILE_TAB_ICONS.timeline ?? ''
}

const hasMultipleAccounts = computed(() => accountsStore.accounts.length > 1)

function columnAccount(colId: string) {
  if (!hasMultipleAccounts.value) return null
  const col = columnMap.value.get(colId)
  if (!col?.accountId) return null
  return accountsStore.accountMap.get(col.accountId) ?? null
}

function columnServerIcon(colId: string): string | null {
  if (!hasMultipleAccounts.value) return null
  const acc = columnAccount(colId)
  if (!acc) return null
  return serversStore.getServer(acc.host)?.iconUrl ?? null
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

// Column pointer drag (swap / stack)
function onColumnPointerDown(colId: string, e: PointerEvent) {
  const target = e.target as HTMLElement
  if (!target.closest('.column-header')) return
  columnDrag.startDrag(colId, e)
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

const WIDE_COLUMN_TYPES: ReadonlySet<string> = new Set(['apiDocs'])

function getColMaxWidth(colId: string): number {
  const col = columnMap.value.get(colId)
  return col && WIDE_COLUMN_TYPES.has(col.type) ? 1200 : COL_MAX_WIDTH
}

function onColumnResize(e: MouseEvent) {
  if (!resizingColId.value) return
  const delta = e.clientX - resizingColStartX.value
  const maxW = getColMaxWidth(resizingColId.value)
  const newW = Math.max(
    COL_MIN_WIDTH,
    Math.min(resizingColStartW.value + delta, maxW),
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

onMounted(() => {
  deckStore.load()
  deckStore.loadWallpaper()
  initDesktopNotifications()
  initApiBridge()
  loadCliCommands()
  onNotificationAction((ctx) => {
    if (ctx.noteId) {
      navigateToNote(ctx.accountId, ctx.noteId)
    } else if (ctx.userId) {
      navigateToUser(ctx.accountId, ctx.userId)
    }
  })
  registerDefaultCommands({
    openCompose,
    openSearch: navigateToSearch,
    openNotifications: navigateToNotifications,
    toggleAddMenu,
    toggleNav: () => navbarRef.value?.toggleNav(),
    toggleAccountMenu: () => navbarRef.value?.toggleFirstAccountMenu(),
  })
  handleResizeRef = () => navbarRef.value?.handleResize()
  window.addEventListener('resize', handleResizeRef)
  setTimeout(checkForUpdate, 5000)
  document.addEventListener('visibilitychange', onVisibilityChange)

  // Column visibility observer
  colVisibility.setup(columnsRef)

  // Launch plugins
  import('@/aiscript/plugin-api').then(({ launchAllPlugins }) => {
    launchAllPlugins(pluginsStore.plugins)
  })

  // Quick Note: global hotkey (Ctrl+Alt+N) opens palette with "post " prefilled
  if (uiStore.isDesktop) {
    import('@tauri-apps/api/event').then(({ listen }) => {
      listen('nd:quick-note', () => {
        commandStore.openWithInput('post ')
      }).then((fn) => {
        unlistenQuickNote = fn
      })
    })
  }
})

onUnmounted(() => {
  import('@/aiscript/plugin-api').then(({ abortAllPlugins }) => {
    abortAllPlugins()
  })
  colVisibility.disconnect()
  destroyApiBridge()
  unregisterDefaultCommands()
  if (handleResizeRef) window.removeEventListener('resize', handleResizeRef)
  document.removeEventListener('visibilitychange', onVisibilityChange)
  unlistenQuickNote?.()
})

function onVisibilityChange() {
  if (!document.hidden) {
    window.dispatchEvent(new CustomEvent('deck-resume'))
  }
}

// Re-observe column cells when layout changes
watch(
  () => deckStore.layout,
  () => {
    nextTick(() => {
      if (!columnsRef.value) return
      for (const cell of columnsRef.value.querySelectorAll<HTMLElement>(
        '.stack-cell[data-column-id]',
      )) {
        colVisibility.observe(cell)
      }
    })
  },
  { flush: 'post', immediate: true, deep: true },
)

// Scroll to column when activeColumnId changes via keyboard navigation
watch(
  () => deckStore.activeColumnId,
  (id) => {
    if (!id || !columnsRef.value) return
    const el = columnsRef.value.querySelector(
      `.stack-cell[data-column-id="${CSS.escape(id)}"]`,
    )
    if (el)
      el.scrollIntoView({
        behavior: 'smooth',
        block: 'nearest',
        inline: 'nearest',
      })
  },
)
</script>

<template>
  <div class="deck-root">
    <DeckNavbar
      ref="navbarRef"
      :mobile-drawer-open="mobileDrawerOpen"
      :show-profile-menu="showProfileMenu"
      :show-settings-menu="showSettingsMenu"
      :update-available="updateAvailable"
      @open-compose="openCompose"
      @update:mobile-drawer-open="mobileDrawerOpen = $event"
      @update:show-profile-menu="showProfileMenu = $event"
      @update:show-settings-menu="showSettingsMenu = $event"
    />

    <!-- Main content area -->
    <div
      class="main-area"
      :class="{ 'with-wallpaper': deckStore.wallpaper != null }"
      :style="{ backgroundImage: deckStore.wallpaper != null ? `url(${deckStore.wallpaper})` : '' }"
    >
      <!-- Column area -->
      <div
        ref="columnsRef"
        class="columns"
        @wheel="onColumnsWheel"
        @scroll="onColumnsScroll"
      >
        <div
          v-if="dropInsertIndex === 0"
          class="drop-placeholder"
          :style="{ flexBasis: dropInsertWidth + 'px' }"
        />
        <template v-for="(group, groupIndex) in deckStore.layout" :key="group.join('-')">
          <section
            class="column-section"
            :class="{ stacked: group.length > 1, 'wide-column': WIDE_COLUMN_TYPES.has(columnMap.get(group[0]!)?.type ?? '') }"
            :style="{ flexBasis: (columnMap.get(group[0]!)?.width ?? 400) + 'px' }"
          >
            <div
              v-for="colId in group"
              :key="colId"
              class="stack-cell"
              :class="{ 'drag-source': columnDrag.dragColumnId.value === colId }"
              :data-column-id="colId"
              :data-drop-zone="columnDrag.dropTarget.value && 'columnId' in columnDrag.dropTarget.value && columnDrag.dropTarget.value.columnId === colId ? columnDrag.dropTarget.value.position : undefined"
              @mousedown="deckStore.setActiveColumn(colId)"
              @pointerdown="onColumnPointerDown(colId, $event)"
            >
              <component
                v-if="columnMap.get(colId) && COLUMN_COMPONENTS[columnMap.get(colId)!.type]"
                :is="COLUMN_COMPONENTS[columnMap.get(colId)!.type]"
                :column="columnMap.get(colId)!"
              />
            </div>
          </section>
          <div
            class="col-resize-handle"
            :class="{ active: resizingColId === group[0] }"
            @mousedown="startColumnResize(group[0]!, $event)"
          />
          <div
            v-if="dropInsertIndex === groupIndex + 1"
            class="drop-placeholder"
            :style="{ flexBasis: dropInsertWidth + 'px' }"
          />
        </template>
      </div>

      <!-- Bottom bar (column management) -->
      <div class="bottom-bar">
        <div class="bottom-bar-left">
          <div class="profile-menu-wrap">
            <button class="_button bottom-bar-btn" title="Deck profiles" @click.stop="showProfileMenu = !showProfileMenu">
              <i class="ti ti-caret-down" />
            </button>
            <DeckProfileMenu :show="showProfileMenu" @close="showProfileMenu = false" />
          </div>
        </div>
        <button class="_button bottom-bar-btn" title="Add column" @click="toggleAddMenu">
          <i class="ti ti-plus" />
        </button>
        <div class="bottom-bar-right">
          <div class="settings-menu-wrap">
            <button class="_button bottom-bar-btn settings-btn" title="Deck settings" @click.stop="showSettingsMenu = !showSettingsMenu">
              <i class="ti ti-settings" />
              <span v-if="updateAvailable" class="update-dot" />
            </button>
            <DeckSettingsMenu :show="showSettingsMenu" @close="showSettingsMenu = false" />
          </div>
        </div>
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
      <div ref="mobileNavRef" class="mobile-tabs-scroll">
        <button
          v-for="(colId, i) in visibleColumns"
          :key="colId"
          class="_button mobile-tab"
          :class="{ active: activeColumnIndex === i }"
          @click="scrollToColumn(i)"
        >
          <i :class="'ti ti-' + columnIcon(colId)" />
          <span v-if="columnServerIcon(colId)" class="tab-server-badge">
            <img :src="columnServerIcon(colId)!" class="tab-badge-img" />
          </span>
          <span v-else-if="columnAccount(colId)" class="tab-server-badge">
            <span class="tab-badge-initial">{{ columnAccount(colId)!.host.charAt(0).toUpperCase() }}</span>
          </span>
          <span v-if="columnAccount(colId)" class="tab-account-badge">
            <img
              v-if="columnAccount(colId)!.avatarUrl"
              :src="columnAccount(colId)!.avatarUrl!"
              class="tab-badge-img"
            />
            <span v-else class="tab-badge-initial">{{ columnAccount(colId)!.username.charAt(0).toUpperCase() }}</span>
          </span>
        </button>
      </div>
      <button class="_button mobile-tab mobile-add-btn" title="Add column" @click="toggleAddMenu">
        <i class="ti ti-plus" />
      </button>
    </nav>

    <!-- Add column popup -->
    <Teleport to="body">
      <Transition name="modal">
        <AddColumnDialog v-if="showAddMenu" @close="showAddMenu = false" />
      </Transition>
    </Teleport>

    <Teleport to="body">
      <Transition name="modal">
        <MkPostForm
          v-if="showCompose && accountsStore.accounts.length > 0"
          :account-id="accountsStore.accounts[0]!.id"
          :initial-file-paths="pendingFilePaths"
          @close="closeCompose"
          @posted="closeCompose"
        />
      </Transition>
    </Teleport>

    <!-- File drop overlay -->
    <Transition name="fade">
      <div v-if="fileDrop.isDragging.value" class="file-drop-overlay">
        <div class="file-drop-content">
          <i class="ti ti-upload" />
          <span>ファイルをドロップしてアップロード</span>
        </div>
      </div>
    </Transition>

  </div>
</template>

<style scoped>
.deck-root {
  display: flex;
  width: 100%;
  height: 100%;
}

/* ============================================================
   Main area (columns + bottom bar)
   ============================================================ */
.main-area {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
  background: var(--nd-deckBg);
}

.main-area.with-wallpaper {
  background: none;
  background-size: cover;
  background-position: center;
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

.column-section.wide-column {
  max-width: 1200px;
}

/* Stacked columns (vertical split) */
.column-section.stacked {
  display: flex;
  flex-direction: column;
  gap: var(--nd-columnGap, 6px);
}

.stack-cell {
  position: relative;
  height: 100%;
}

.column-section.stacked .stack-cell {
  flex: 1;
  min-height: 0;
  height: auto;
}

/* Column drag feedback */
.stack-cell.drag-source {
  opacity: 0.4;
}

.stack-cell[data-drop-zone]::after {
  content: '';
  position: absolute;
  left: 0;
  right: 0;
  pointer-events: none;
  z-index: 10;
  border-radius: 10px;
}

.stack-cell[data-drop-zone="swap"]::after {
  inset: 0;
  background: color-mix(in srgb, var(--nd-accent) 20%, transparent);
  border: 2px solid var(--nd-accent);
}

.stack-cell[data-drop-zone="above"]::after {
  top: 0;
  height: 50%;
  background: color-mix(in srgb, var(--nd-accent) 15%, transparent);
  border-bottom: 3px solid var(--nd-accent);
  border-radius: 10px 10px 0 0;
}

.stack-cell[data-drop-zone="below"]::after {
  bottom: 0;
  height: 50%;
  background: color-mix(in srgb, var(--nd-accent) 15%, transparent);
  border-top: 3px solid var(--nd-accent);
  border-radius: 0 0 10px 10px;
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

.drop-placeholder {
  flex-shrink: 0;
  border: 2px dashed var(--nd-accent);
  border-radius: 10px;
  background: color-mix(in srgb, var(--nd-accent) 10%, transparent);
  box-shadow: 0 0 12px color-mix(in srgb, var(--nd-accent) 30%, transparent);
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

.profile-menu-wrap,
.settings-menu-wrap {
  position: relative;
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

.settings-btn {
  position: relative;
}

.update-dot {
  position: absolute;
  top: 6px;
  right: 6px;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--nd-accent);
  pointer-events: none;
}

/* ============================================================
   Mobile nav (hidden on desktop)
   ============================================================ */
.mobile-nav,
.mobile-fab {
  display: none;
}

@media (max-width: 500px) {
  .col-resize-handle,
  .bottom-bar {
    display: none !important;
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
  .mobile-menu-btn,
  .mobile-add-btn {
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
    right: calc(16px + env(safe-area-inset-right));
    bottom: calc(60px + var(--nd-safe-area-bottom, env(safe-area-inset-bottom)));
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
    font-size: 20px;
    box-shadow: 0 4px 12px var(--nd-shadow);
    transition: transform 0.3s ease, box-shadow 0.2s ease;
  }

  .mobile-fab:hover {
    transform: scale(1.05);
    box-shadow: 0 6px 20px color-mix(in srgb, var(--nd-accent) 40%, rgba(0, 0, 0, 0.3));
  }

  .mobile-fab:active {
    transform: scale(0.92);
  }

  .mobile-nav {
    display: flex;
    align-items: stretch;
    flex: 0 0 auto;
    height: 50px;
    padding-bottom: var(--nd-safe-area-bottom, env(safe-area-inset-bottom));
    background: color-mix(in srgb, var(--nd-navBg) 80%, transparent);
    backdrop-filter: blur(15px);
    -webkit-backdrop-filter: blur(15px);
    border-top: 1px solid var(--nd-divider);
  }

  .mobile-tabs-scroll {
    display: flex;
    align-items: stretch;
    justify-content: space-evenly;
    flex: 1;
    min-width: 0;
    overflow-x: auto;
    overflow-y: hidden;
    -webkit-overflow-scrolling: touch;
    scrollbar-width: none;
  }

  .mobile-tabs-scroll::-webkit-scrollbar {
    display: none;
  }

  .mobile-tab {
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
    flex: 0 0 auto;
    min-width: 50px;
    min-height: 50px;
    padding: 0 8px;
    font-size: 20px;
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
    transform: scale(0.9);
    transition: opacity 0.1s, color 0.2s, transform 0.1s;
  }

  .tab-server-badge,
  .tab-account-badge {
    position: absolute;
    width: 14px;
    height: 14px;
    border-radius: 50%;
    overflow: hidden;
    border: 1.5px solid var(--nd-navBg);
    background: var(--nd-navBg);
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .tab-server-badge {
    top: 5px;
    right: calc(50% - 16px);
  }

  .tab-account-badge {
    bottom: 4px;
    left: calc(50% - 16px);
  }

  .tab-badge-img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    border-radius: 50%;
  }

  .tab-badge-initial {
    font-size: 7px;
    font-weight: bold;
    line-height: 1;
    color: var(--nd-fg);
    opacity: 0.7;
  }


}
</style>

<style>
.modal-enter-active,
.modal-leave-active {
  transition: opacity 0.2s ease;
}

.modal-enter-from,
.modal-leave-to {
  opacity: 0;
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

.file-drop-overlay {
  position: fixed;
  inset: 0;
  z-index: 9999;
  background: rgba(0, 0, 0, 0.6);
  display: flex;
  align-items: center;
  justify-content: center;
  pointer-events: none;
}

.file-drop-content {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  color: #fff;
  font-size: 18px;
  font-weight: 600;
}

.file-drop-content .ti {
  font-size: 48px;
  opacity: 0.9;
}
</style>
