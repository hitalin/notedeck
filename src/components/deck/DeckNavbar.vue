<script setup lang="ts">
import { invoke } from '@tauri-apps/api/core'
import { computed, onUnmounted, ref, watch } from 'vue'
import type { StreamConnectionState } from '@/adapters/types'
import { useNavigation } from '@/composables/useNavigation'
import { useAccountsStore } from '@/stores/accounts'
import { useDeckStore } from '@/stores/deck'
import { useServersStore } from '@/stores/servers'
import { useStreamingStore } from '@/stores/streaming'
import {
  clearAvailableTlCache,
  detectAvailableTimelines,
} from '@/utils/customTimelines'
import { AppError } from '@/utils/errors'
import NavAccountMenu from './NavAccountMenu.vue'

const props = defineProps<{
  mobileDrawerOpen: boolean
}>()

const emit = defineEmits<{
  'open-compose': []
  'update:mobileDrawerOpen': [value: boolean]
}>()

const {
  navigateToLogin,
  navigateToSearch,
  navigateToNotifications,
  navigateToPlugins,
} = useNavigation()
const deckStore = useDeckStore()
const accountsStore = useAccountsStore()
const serversStore = useServersStore()
const streamingStore = useStreamingStore()

// Per-account server icon URL
function getServerIconUrl(host: string): string {
  return serversStore.getServer(host)?.iconUrl || `https://${host}/favicon.ico`
}

// Per-account streaming connection state
function getAccountStreamState(accountId: string): StreamConnectionState {
  return streamingStore.getState(accountId) ?? 'initializing'
}

// Navbar resize
const MIN_WIDTH = 68
const COLLAPSE_THRESHOLD = 120
const DEFAULT_WIDTH = 200
const MAX_WIDTH = 400
const navWidth = ref(window.innerWidth <= 1279 ? MIN_WIDTH : DEFAULT_WIDTH)
const isResizing = ref(false)
const navCollapsed = computed(() => navWidth.value <= MIN_WIDTH)
watch(
  navCollapsed,
  (v) => {
    deckStore.navCollapsed = v
  },
  { immediate: true },
)

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
}

function onDocumentClick(e: MouseEvent) {
  if (!accountMenuId.value) return
  const target = e.target as HTMLElement
  if (target.closest('.nav-account-menu') || target.closest('.nav-account'))
    return
  accountMenuId.value = null
}

document.addEventListener('click', onDocumentClick)
onUnmounted(() => document.removeEventListener('click', onDocumentClick))

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
  for (const col of deckStore.columns) {
    if (col.accountId === id) {
      deckStore.removeColumn(col.id)
    }
  }
  accountsStore.removeAccount(id)
  accountMenuId.value = null
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

defineExpose({
  toggleNav,
  toggleFirstAccountMenu,
  handleResize,
  navWidth,
})
</script>

<template>
  <div class="deck-navbar">
    <nav class="navbar" :class="{ collapsed: navCollapsed, 'drawer-open': props.mobileDrawerOpen }" :style="{ flexBasis: navWidth + 'px' }">
      <div class="nav-body">
        <!-- Top section -->
        <div class="nav-top">
          <button
            class="_button nav-item"
            title="Notifications"
            @click="navigateToNotifications()"
          >
            <i class="ti ti-bell" />
            <span class="nav-label">Notifications</span>
          </button>
          <button
            class="_button nav-item"
            title="Search"
            @click="navigateToSearch()"
          >
            <i class="ti ti-search" />
            <span class="nav-label">Search</span>
          </button>
          <button
            class="_button nav-item"
            title="Plugins"
            @click="navigateToPlugins()"
          >
            <i class="ti ti-plug" />
            <span class="nav-label">Plugins</span>
          </button>
        </div>

        <!-- Spacer -->
        <div class="nav-spacer" />

        <!-- Bottom section: post button → accounts -->
        <div class="nav-bottom">
          <!-- Post button -->
          <button
            class="_button nav-post-btn"
            :class="{ collapsed: navCollapsed }"
            title="New Note"
            @click="emit('open-compose')"
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
              <div class="nav-avatar-wrap">
                <img
                  v-if="acc.avatarUrl"
                  :src="acc.avatarUrl"
                  class="nav-avatar"
                />
                <div v-else class="nav-avatar nav-avatar-placeholder" />
                <img
                  :src="getServerIconUrl(acc.host)"
                  class="nav-server-badge"
                  :title="acc.host"
                />
                <span
                  class="nav-stream-dot"
                  :class="getAccountStreamState(acc.id)"
                />
              </div>
              <span class="nav-label">@{{ acc.username }}@{{ acc.host }}</span>
            </button>

            <NavAccountMenu
              :show="accountMenuId === acc.id"
              :account="acc"
              :nav-collapsed="navCollapsed"
              :modes="accountModes[acc.id] ?? {}"
              :toggling-mode="togglingMode"
              :mode-error="modeError"
              @toggle-mode="toggleAccountMode(acc.id, $event)"
              @logout="logout(acc.id)"
            />
          </div>

          <!-- Add account -->
          <button class="_button nav-item nav-add-account" title="Add account" @click="navigateToLogin()">
            <i class="ti ti-plus" />
            <span class="nav-label">Add account</span>
          </button>
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
  </div>
</template>

<style scoped>
.deck-navbar {
  display: contents;
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
  padding: 10px 16px;
}

.nav-spacer {
  flex: 1;
}

.nav-divider {
  height: 1px;
  background: var(--nd-divider);
  margin: 10px 16px;
}

.nav-item {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 10px 14px;
  border-radius: 999px;
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
  opacity: 0.7;
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
  padding: 16px 0;
  width: 100%;
}

.collapsed .nav-top,
.collapsed .nav-bottom {
  padding: 10px 0;
  align-items: center;
}

/* Account in nav */
.nav-account {
  gap: 10px;
}

.nav-avatar-wrap {
  position: relative;
  flex-shrink: 0;
}

.nav-avatar {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  object-fit: cover;
  display: block;
}

.collapsed .nav-avatar {
  width: 34px;
  height: 34px;
}

.nav-avatar-placeholder {
  background: var(--nd-buttonBg);
}

.nav-server-badge {
  position: absolute;
  top: -2px;
  right: -4px;
  width: 14px;
  height: 14px;
  border-radius: 50%;
  object-fit: cover;
  border: 1.5px solid var(--nd-navBg);
}

.collapsed .nav-server-badge {
  width: 16px;
  height: 16px;
  top: -2px;
  right: -4px;
}

.nav-stream-dot {
  position: absolute;
  bottom: -1px;
  right: -3px;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  border: 1.5px solid var(--nd-navBg);
}

.nav-stream-dot.connected {
  background: var(--nd-accent);
}

.nav-stream-dot.reconnecting,
.nav-stream-dot.initializing {
  background: var(--nd-warn, #e5a400);
}

.nav-stream-dot.disconnected {
  background: #888;
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

.navbar:hover .nav-toggle {
  opacity: 0.5;
}

.nav-toggle:hover {
  opacity: 1 !important;
}

.nav-account-wrap {
  position: relative;
}

@media (max-width: 500px) {
  .nav-resize-handle,
  .nav-toggle {
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
    overflow: visible;
    direction: rtl;
  }

  /* On mobile drawer, show menu above the button (not to the right) */
  .navbar.drawer-open :deep(.nav-account-menu.menu-right) {
    bottom: 100%;
    top: auto;
    left: 0;
    right: 0;
    margin-bottom: 4px;
    margin-left: 0;
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
}
</style>
