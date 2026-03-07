<script setup lang="ts">
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
import { provideColumnVisibility } from '@/composables/useColumnVisibility'
import { useNavigation } from '@/composables/useNavigation'
import { useUpdater } from '@/composables/useUpdater'
import { useAccountsStore } from '@/stores/accounts'
import type { DeckColumn } from '@/stores/deck'
import { useDeckStore } from '@/stores/deck'
import { usePluginsStore } from '@/stores/plugins'
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

import DeckAiColumn from './DeckAiColumn.vue'
import DeckAiScriptColumn from './DeckAiScriptColumn.vue'
import DeckAntennaColumn from './DeckAntennaColumn.vue'
import DeckChannelColumn from './DeckChannelColumn.vue'
import DeckChatColumn from './DeckChatColumn.vue'
import DeckClipColumn from './DeckClipColumn.vue'
import DeckFavoritesColumn from './DeckFavoritesColumn.vue'
import DeckListColumn from './DeckListColumn.vue'
import DeckMentionsColumn from './DeckMentionsColumn.vue'
import DeckNavbar from './DeckNavbar.vue'
import DeckNotificationColumn from './DeckNotificationColumn.vue'
import DeckPageColumn from './DeckPageColumn.vue'
import DeckPlayColumn from './DeckPlayColumn.vue'
import DeckProfileMenu from './DeckProfileMenu.vue'
import DeckSearchColumn from './DeckSearchColumn.vue'
import DeckSettingsMenu from './DeckSettingsMenu.vue'
import DeckSpecifiedColumn from './DeckSpecifiedColumn.vue'
import DeckTimelineColumn from './DeckTimelineColumn.vue'
import DeckUserColumn from './DeckUserColumn.vue'
import DeckWidgetColumn from './DeckWidgetColumn.vue'

const router = useRouter()
const {
  navigateToNote,
  navigateToUser,
  navigateToSearch,
  navigateToNotifications,
} = useNavigation()
const deckStore = useDeckStore()
const accountsStore = useAccountsStore()
const pluginsStore = usePluginsStore()
const commandStore = useCommandStore()
const uiStore = useUiStore()
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
}

function toggleAddMenu() {
  showAddMenu.value = !showAddMenu.value
}

// Column visibility tracking (pauses streaming for off-screen columns)
const colVisibility = provideColumnVisibility()

let handleResizeRef: (() => void) | null = null
let unlistenQuickNote: (() => void) | null = null

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
  chat: 'messages',
  widget: 'app-window',
  aiscript: 'code',
  play: 'player-play',
  page: 'note',
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

onMounted(() => {
  deckStore.load()
  deckStore.loadActiveProfileId()
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

// Re-observe column sections when layout changes
watch(
  resolvedColumns,
  () => {
    nextTick(() => {
      if (!columnsRef.value) return
      for (const section of columnsRef.value.querySelectorAll<HTMLElement>(
        '.column-section[data-column-id]',
      )) {
        colVisibility.observe(section)
      }
    })
  },
  { flush: 'post', immediate: true },
)

// Scroll to column when activeColumnId changes via keyboard navigation
watch(
  () => deckStore.activeColumnId,
  (id) => {
    if (!id || !columnsRef.value) return
    const el = columnsRef.value.querySelector(
      `.column-section[data-column-id="${CSS.escape(id)}"]`,
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
      @open-compose="openCompose"
      @update:mobile-drawer-open="mobileDrawerOpen = $event"
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
        <template v-for="col in resolvedColumns" :key="col.id">
          <section
            class="column-section"
            :data-column-id="col.id"
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
            <DeckChatColumn
              v-else-if="col.type === 'chat'"
              :column="col"
            />
            <DeckWidgetColumn
              v-else-if="col.type === 'widget'"
              :column="col"
            />
            <DeckAiScriptColumn
              v-else-if="col.type === 'aiscript'"
              :column="col"
            />
            <DeckPlayColumn
              v-else-if="col.type === 'play'"
              :column="col"
            />
            <DeckPageColumn
              v-else-if="col.type === 'page'"
              :column="col"
            />
            <DeckAiColumn
              v-else-if="col.type === 'ai'"
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
      <div class="mobile-menu-wrap">
        <button class="_button mobile-tab mobile-edge-btn" title="プロフィール" @click.stop="showProfileMenu = !showProfileMenu">
          <i class="ti ti-layout" />
        </button>
        <DeckProfileMenu :show="showProfileMenu" @close="showProfileMenu = false" />
      </div>
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
      <div class="mobile-menu-wrap">
        <button class="_button mobile-tab mobile-edge-btn" title="設定" @click.stop="showSettingsMenu = !showSettingsMenu">
          <i class="ti ti-settings" />
          <span v-if="updateAvailable" class="update-dot" />
        </button>
        <DeckSettingsMenu :show="showSettingsMenu" @close="showSettingsMenu = false" />
      </div>
    </nav>

    <!-- Add column popup -->
    <Teleport to="body">
      <AddColumnDialog v-if="showAddMenu" @close="showAddMenu = false" />
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

  .mobile-menu-btn {
    flex: 0 0 auto !important;
    width: 50px;
  }

  .mobile-edge-btn {
    flex: 0 0 auto !important;
    width: 50px;
  }

  .mobile-menu-wrap {
    position: relative;
    flex: 0 0 auto;
    display: flex;
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
    bottom: calc(60px + env(safe-area-inset-bottom));
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
    height: 50px;
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
    min-height: 50px;
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

}
</style>
