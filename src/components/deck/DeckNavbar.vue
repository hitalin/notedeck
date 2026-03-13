<script setup lang="ts">
import { invoke } from '@tauri-apps/api/core'
import { computed, onUnmounted, ref, watch } from 'vue'
import type { StreamConnectionState } from '@/adapters/types'
import { useNavigation } from '@/composables/useNavigation'
import { useUnreadChat } from '@/composables/useUnreadChat'
import { useUnreadNotifications } from '@/composables/useUnreadNotifications'
import { useAccountsStore } from '@/stores/accounts'
import { useDeckStore } from '@/stores/deck'
import { useServersStore } from '@/stores/servers'
import { useStreamingStore } from '@/stores/streaming'
import { useUiStore } from '@/stores/ui'
import {
  clearAvailableTlCache,
  detectAvailableTimelines,
} from '@/utils/customTimelines'
import { AppError } from '@/utils/errors'
import DeckProfileMenu from './DeckProfileMenu.vue'
import DeckSettingsMenu from './DeckSettingsMenu.vue'
import NavAccountMenu from './NavAccountMenu.vue'

const props = defineProps<{
  mobileDrawerOpen: boolean
  showProfileMenu: boolean
  showSettingsMenu: boolean
  updateAvailable: boolean
}>()

const emit = defineEmits<{
  'open-compose': []
  'update:mobileDrawerOpen': [value: boolean]
  'update:showProfileMenu': [value: boolean]
  'update:showSettingsMenu': [value: boolean]
}>()

const {
  navigateToLogin,
  navigateToSearch,
  navigateToNotifications,
  navigateToPlugins,
  navigateToAi,
  navigateToChat,
} = useNavigation()
const deckStore = useDeckStore()
const { isMobile } = useUiStore()
const { totalUnread, markAllAsRead } = useUnreadNotifications()
const { totalUnread: chatUnread, resetAll: resetChatUnread } = useUnreadChat()

function openNotifications() {
  markAllAsRead()
  navigateToNotifications()
}

function openChat() {
  resetChatUnread()
  navigateToChat()
}

function closeDrawerAndDo(fn: () => void) {
  emit('update:mobileDrawerOpen', false)
  fn()
}
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
const accountIsAdmin = ref<Record<string, boolean>>({})
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
  try {
    const me = await invoke<Record<string, unknown>>('api_request', {
      accountId: id,
      endpoint: 'i',
    })
    accountIsAdmin.value = {
      ...accountIsAdmin.value,
      [id]: me.isAdmin === true || me.isModerator === true,
    }
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
        '権限がありません。write:account の権限を付与するために再ログインしてください。'
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
    <nav class="navbar" :class="{ 'drawer-open': props.mobileDrawerOpen }" :style="{ flexBasis: navWidth + 'px' }">
      <div class="nav-body">
        <!-- Top section -->
        <div class="nav-top">
          <button
            class="_button nav-item"
            title="通知"
            @click="closeDrawerAndDo(openNotifications)"
          >
            <div class="nav-icon-wrap">
              <i class="ti ti-bell" />
              <span v-if="totalUnread > 0" class="nav-badge">{{ totalUnread > 99 ? '99+' : totalUnread }}</span>
            </div>
            <span class="nav-label">通知</span>
          </button>
          <button
            class="_button nav-item"
            title="チャット"
            @click="closeDrawerAndDo(openChat)"
          >
            <div class="nav-icon-wrap">
              <i class="ti ti-messages" />
              <span v-if="chatUnread > 0" class="nav-badge">{{ chatUnread > 99 ? '99+' : chatUnread }}</span>
            </div>
            <span class="nav-label">チャット</span>
          </button>
          <button
            class="_button nav-item"
            title="検索"
            @click="closeDrawerAndDo(navigateToSearch)"
          >
            <i class="ti ti-search" />
            <span class="nav-label">検索</span>
          </button>
          <button
            class="_button nav-item"
            title="プラグイン"
            @click="closeDrawerAndDo(navigateToPlugins)"
          >
            <i class="ti ti-plug" />
            <span class="nav-label">プラグイン</span>
          </button>
          <button
            v-if="!isMobile"
            class="_button nav-item"
            title="AI アシスタント"
            @click="closeDrawerAndDo(navigateToAi)"
          >
            <i class="ti ti-sparkles" />
            <span class="nav-label">AI</span>
          </button>
        </div>

        <!-- Spacer -->
        <div class="nav-spacer" />

        <!-- Bottom section: post button → accounts -->
        <div class="nav-bottom">
          <!-- Mobile-only: profile & settings -->
          <div class="nav-mobile-only">
            <div class="nav-menu-wrap">
              <button
                class="_button nav-item"
                title="プロファイル"
                @pointerdown.stop
                @click.stop="emit('update:showProfileMenu', !props.showProfileMenu)"
              >
                <i class="ti ti-layout" />
                <span class="nav-label">プロファイル</span>
              </button>
              <DeckProfileMenu :show="props.showProfileMenu" @close="emit('update:showProfileMenu', false)" />
            </div>
            <div class="nav-menu-wrap">
              <button
                class="_button nav-item"
                title="設定"
                @pointerdown.stop
                @click.stop="emit('update:showSettingsMenu', !props.showSettingsMenu)"
              >
                <i class="ti ti-settings" />
                <span class="nav-label">設定</span>
                <span v-if="props.updateAvailable" class="update-dot" />
              </button>
              <DeckSettingsMenu :show="props.showSettingsMenu" @close="emit('update:showSettingsMenu', false)" />
            </div>
            <div class="nav-divider" />
          </div>

          <!-- Post button -->
          <button
            class="_button nav-post-btn"
            title="ノート作成"
            @click="closeDrawerAndDo(() => emit('open-compose'))"
          >
            <i class="ti ti-pencil" />
            <span class="nav-label">ノート</span>
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
                  class="nav-online-indicator"
                  :class="`status-${getAccountStreamState(acc.id)}`"
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
              :is-admin="accountIsAdmin[acc.id] ?? false"
              @toggle-mode="toggleAccountMode(acc.id, $event)"
              @logout="logout(acc.id)"
            />
          </div>

          <!-- Add account -->
          <button class="_button nav-item nav-add-account" title="アカウント追加" @click="closeDrawerAndDo(navigateToLogin)">
            <i class="ti ti-plus" />
            <span class="nav-label">アカウント追加</span>
          </button>
        </div>
      </div>

      <!-- Collapse toggle -->
      <button class="nav-toggle" title="サイドバー切替" @click="toggleNav">
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
   Left Navbar — base styles (all sizes)
   ============================================================ */
.navbar {
  flex: 0 0 auto;
  display: flex;
  background: color-mix(in srgb, var(--nd-navBg) 80%, transparent);
  backdrop-filter: blur(15px);
  -webkit-backdrop-filter: blur(15px);
  border-right: 1px solid var(--nd-divider);
  position: relative;
  z-index: 1;
  container-type: inline-size;
  container-name: navbar;
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

.nav-icon-wrap {
  position: relative;
  display: inline-flex;
  flex-shrink: 0;
}

.nav-badge {
  position: absolute;
  top: -8px;
  right: -10px;
  min-width: 16px;
  height: 16px;
  padding: 0 4px;
  border-radius: 999px;
  background: var(--nd-indicator, #e53935);
  color: #fff;
  font-size: 10px;
  font-weight: bold;
  line-height: 16px;
  text-align: center;
  pointer-events: none;
  box-sizing: border-box;
}

.nav-label {
  overflow: hidden;
  text-overflow: ellipsis;
}

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

.nav-online-indicator {
  position: absolute;
  bottom: 0;
  left: 0;
  width: 20%;
  height: 20%;
  border-radius: 50%;
  box-shadow: 0 0 0 2px var(--nd-navBg);
}

.nav-online-indicator.status-connected {
  background: var(--nd-statusOnline);
}

.nav-online-indicator.status-reconnecting,
.nav-online-indicator.status-initializing {
  background: var(--nd-statusActive);
}

.nav-online-indicator.status-disconnected {
  background: var(--nd-statusOffline);
}

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
  box-shadow: 0 4px 12px color-mix(in srgb, var(--nd-accent) 40%, transparent);
}

.nav-post-btn:active {
  transform: scale(0.97);
}

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
  opacity: 1;
}

.nav-account-wrap {
  position: relative;
}

.nav-mobile-only {
  display: none;
}

.nav-menu-wrap {
  position: relative;
}

.update-dot {
  position: absolute;
  top: 8px;
  right: 8px;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--nd-accent);
  pointer-events: none;
}

/* ============================================================
   Icon-only mode — navbar adapts to its own width via
   Container Query. No class flags needed.
   ============================================================ */
@container navbar (max-width: 100px) {
  .nav-body {
    overflow: visible;
    direction: ltr;
  }

  .nav-label {
    display: none;
  }

  .nav-item {
    justify-content: center;
    padding: 16px 0;
    width: 100%;
    font-size: 1.4em;
  }

  .nav-account {
    padding: 8px;
    width: auto;
    border-radius: 999px;
  }

  .nav-top,
  .nav-bottom {
    padding: 10px 0;
    align-items: center;
  }

  .nav-avatar {
    width: 38px;
    height: 38px;
  }

  .nav-server-badge {
    width: 16px;
    height: 16px;
    top: -2px;
    right: -4px;
  }

  .nav-post-btn {
    width: 54px;
    height: 54px;
    padding: 0;
    margin: 0 auto;
    border-radius: 50%;
    justify-content: center;
    font-size: 1.3em;
  }
}

/* ============================================================
   Small viewport drawer mode (≤500px)
   Only layout/positioning — size adaptation is handled by
   Container Query (navbar is 250px → full mode automatically).
   ============================================================ */
@media (max-width: 500px) {
  .nav-mobile-only {
    display: flex;
    flex-direction: column;
  }

  .nav-resize-handle,
  .nav-toggle {
    display: none !important;
  }

  .navbar {
    position: fixed;
    top: 0;
    left: 0;
    bottom: 0;
    z-index: 2000;
    width: 250px !important;
    flex-basis: 250px !important;
    padding-top: max(var(--nd-safe-area-top, env(safe-area-inset-top)), 12px);
    padding-bottom: var(--nd-safe-area-bottom, env(safe-area-inset-bottom));
    transform: translateX(-100%);
    transition: transform 0.25s ease;
    box-shadow: none;
  }

  .navbar .nav-item {
    min-height: 44px;
  }

  .navbar.drawer-open {
    transform: translateX(0);
    box-shadow: 4px 0 16px rgb(0 0 0 / 0.3);
  }

  .navbar.drawer-open :deep(.nav-account-menu.menu-right) {
    bottom: 100%;
    top: auto;
    left: 0;
    right: 0;
    margin-bottom: 4px;
    margin-left: 0;
  }
}
</style>

<!-- Mobile drawer: platform-specific layout only (size adaptation is handled by Container Query) -->
<style>
html.nd-mobile .nav-mobile-only {
  display: flex !important;
  flex-direction: column;
}

html.nd-mobile .nav-resize-handle,
html.nd-mobile .nav-toggle {
  display: none !important;
}

html.nd-mobile .navbar {
  position: fixed !important;
  top: 0;
  left: 0;
  bottom: 0;
  z-index: 2000;
  width: 250px !important;
  flex-basis: 250px !important;
  padding-top: max(var(--nd-safe-area-top, env(safe-area-inset-top)), 12px);
  padding-bottom: var(--nd-safe-area-bottom, env(safe-area-inset-bottom));
  transform: translateX(-100%);
  transition: transform 0.25s ease;
  box-shadow: none;
}

html.nd-mobile .navbar .nav-item {
  min-height: 44px;
}

html.nd-mobile .navbar.drawer-open {
  transform: translateX(0);
  box-shadow: 4px 0 16px rgb(0 0 0 / 0.3);
}

html.nd-mobile .navbar.drawer-open .nav-account-menu.menu-right {
  bottom: 100%;
  top: auto;
  left: 0;
  right: 0;
  margin-bottom: 4px;
  margin-left: 0;
}
</style>
