<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import MkPostForm from '@/components/common/MkPostForm.vue'
import { useGlobalShortcuts } from '@/composables/useGlobalShortcuts'
import { useAccountsStore } from '@/stores/accounts'
import type { DeckColumn } from '@/stores/deck'
import { useDeckStore } from '@/stores/deck'
import { initDesktopNotifications } from '@/utils/desktopNotification'
import DeckNotificationColumn from './DeckNotificationColumn.vue'
import DeckSearchColumn from './DeckSearchColumn.vue'
import DeckTimelineColumn from './DeckTimelineColumn.vue'

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

const showAddMenu = ref(false)
const showCompose = ref(false)

// Navbar resize
const MIN_WIDTH = 68
const COLLAPSE_THRESHOLD = 120
const DEFAULT_WIDTH = 250
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

// Wheel deltaY → scrollLeft conversion for horizontal column scrolling
const columnsRef = ref<HTMLElement | null>(null)
function onColumnsWheel(e: WheelEvent) {
  if (!columnsRef.value) return
  if (Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return
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
    <nav class="navbar" :class="{ collapsed: navCollapsed }" :style="{ flexBasis: navWidth + 'px' }">
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

          <router-link to="/settings" class="_button nav-item" title="Settings">
            <svg viewBox="0 0 24 24" width="20" height="20">
              <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"
                stroke="currentColor" stroke-width="1.5" fill="none" />
              <circle cx="12" cy="12" r="3" stroke="currentColor" stroke-width="1.5" fill="none" />
            </svg>
            <span class="nav-label">Settings</span>
          </router-link>
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

          <!-- Account avatars -->
          <button
            v-for="acc in accountsStore.accounts"
            :key="acc.id"
            class="_button nav-item nav-account"
            :title="`@${acc.username}@${acc.host}`"
            @click="router.push(`/user/${acc.id}/${acc.userId}`)"
          >
            <img
              v-if="acc.avatarUrl"
              :src="acc.avatarUrl"
              class="nav-avatar"
            />
            <div v-else class="nav-avatar nav-avatar-placeholder" />
            <span class="nav-label">@{{ acc.username }}@{{ acc.host }}</span>
          </button>

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
      >
        <template v-for="group in deckStore.layout" :key="group.join('-')">
          <section v-for="colId in group" :key="colId" class="column-section">
            <template v-if="columnMap.get(colId)" :key="colId">
              <DeckTimelineColumn
                v-if="columnMap.get(colId)!.type === 'timeline'"
                :column="columnMap.get(colId)!"
              />
              <DeckNotificationColumn
                v-else-if="columnMap.get(colId)!.type === 'notifications'"
                :column="columnMap.get(colId)!"
              />
              <DeckSearchColumn
                v-else-if="columnMap.get(colId)!.type === 'search'"
                :column="columnMap.get(colId)!"
              />
            </template>
          </section>
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
        <div class="bottom-bar-right">
          <button class="_button bottom-bar-btn" title="Deck settings" @click="router.push('/settings')">
            <svg viewBox="0 0 24 24" width="14" height="14">
              <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"
                stroke="currentColor" stroke-width="1.5" fill="none" />
              <circle cx="12" cy="12" r="3" stroke="currentColor" stroke-width="1.5" fill="none" />
            </svg>
          </button>
        </div>
      </div>
    </div>

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
  overflow: hidden;
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
  flex: 0 0 330px;
  min-width: 280px;
  max-width: 500px;
  height: 100%;
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
</style>
