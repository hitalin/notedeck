<script setup lang="ts">
import { computed, onUnmounted, ref, useCssModule, watch } from 'vue'
import { useNavigation } from '@/composables/useNavigation'
import { useUnreadChat } from '@/composables/useUnreadChat'
import { useUnreadNotifications } from '@/composables/useUnreadNotifications'
import {
  type Account,
  getAccountLabel,
  isGuestAccount,
  useAccountsStore,
} from '@/stores/accounts'
import { useDeckStore } from '@/stores/deck'
import { useServersStore } from '@/stores/servers'
import { useStreamingStore } from '@/stores/streaming'
import { useIsCompactLayout } from '@/stores/ui'
import {
  clearAvailableTlCache,
  detectAvailableTimelines,
} from '@/utils/customTimelines'
import { AppError } from '@/utils/errors'
import { invoke } from '@/utils/tauriInvoke'
import DeckProfileMenu from './DeckProfileMenu.vue'
import DeckSettingsMenu from './DeckSettingsMenu.vue'
import LogoutDialog from './LogoutDialog.vue'
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

const $style = useCssModule()
const {
  navigateToLogin,
  navigateToSearch,
  navigateToNotifications,
  navigateToPlugins,
  navigateToAi,
  navigateToChat,
} = useNavigation()
const deckStore = useDeckStore()
const isCompact = useIsCompactLayout()
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

function getServerIconUrl(host: string): string {
  return serversStore.getServer(host)?.iconUrl || `https://${host}/favicon.ico`
}

watch(
  () => accountsStore.accounts.length,
  () => {
    for (const acc of accountsStore.accounts) {
      if (acc.hasToken) {
        streamingStore.fetchOnlineStatus(acc.id, acc.userId)
      } else {
        streamingStore.disconnect(acc.id)
      }
    }
  },
  { immediate: true },
)

const statusClassMap: Record<string, string> = {
  online: $style.statusOnline,
  active: $style.statusActive,
  offline: $style.statusOffline,
  unknown: $style.statusUnknown,
}

function onlineStatusClass(accountId: string): string | undefined {
  return statusClassMap[streamingStore.getState(accountId)]
}

// Navbar resize
const MIN_WIDTH = 80
const COLLAPSE_THRESHOLD = 140
const DEFAULT_WIDTH = 250
const MAX_WIDTH = 400
const navWidth = ref(
  document.documentElement.clientWidth <= 1279 ? MIN_WIDTH : DEFAULT_WIDTH,
)
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
  if (
    target.closest(`.${$style.account}`) ||
    target.closest('.nav-account-menu')
  )
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
    const me = await invoke<Record<string, unknown>>('api_get_self', {
      accountId: id,
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

const logoutTargetId = ref<string | null>(null)

function showLogoutDialog(id: string) {
  logoutTargetId.value = id
  accountMenuId.value = null
}

function logoutKeepData() {
  if (!logoutTargetId.value) return
  const id = logoutTargetId.value
  streamingStore.disconnect(id)
  accountsStore.logoutAccount(id)
  logoutTargetId.value = null
}

function logoutDeleteAll() {
  if (!logoutTargetId.value) return
  const id = logoutTargetId.value
  for (const col of deckStore.columns) {
    if (col.accountId === id) {
      deckStore.removeColumn(col.id)
    }
  }
  accountsStore.removeAccount(id)
  logoutTargetId.value = null
}

function toggleFirstAccountMenu() {
  const first = accountsStore.accounts[0]
  if (first) toggleAccountMenu(first.id)
}

function handleResize() {
  if (document.documentElement.clientWidth <= 1279) {
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
  <div :class="$style.wrapper">
    <nav
      :class="[
        $style.navbar,
        {
          [$style.drawerMode]: isCompact,
          [$style.drawerOpen]: props.mobileDrawerOpen,
        },
      ]"
      :style="isCompact ? undefined : { flexBasis: navWidth + 'px' }"
    >
      <div :class="$style.body">
        <!-- Top section -->
        <div :class="$style.section">
          <button
            class="_button"
            :class="$style.item"
            title="通知"
            @click="closeDrawerAndDo(openNotifications)"
          >
            <div :class="$style.iconWrap">
              <i class="ti ti-bell" />
              <span v-if="totalUnread > 0" :class="$style.badge">{{ totalUnread > 99 ? '99+' : totalUnread }}</span>
            </div>
            <span :class="$style.label">通知</span>
          </button>
          <button
            class="_button"
            :class="$style.item"
            title="チャット"
            @click="closeDrawerAndDo(openChat)"
          >
            <div :class="$style.iconWrap">
              <i class="ti ti-messages" />
              <span v-if="chatUnread > 0" :class="$style.badge">{{ chatUnread > 99 ? '99+' : chatUnread }}</span>
            </div>
            <span :class="$style.label">チャット</span>
          </button>
          <button
            class="_button"
            :class="$style.item"
            title="検索"
            @click="closeDrawerAndDo(navigateToSearch)"
          >
            <i class="ti ti-search" />
            <span :class="$style.label">検索</span>
          </button>
          <button
            class="_button"
            :class="$style.item"
            title="プラグイン"
            @click="closeDrawerAndDo(navigateToPlugins)"
          >
            <i class="ti ti-plug" />
            <span :class="$style.label">プラグイン</span>
          </button>
          <button
            v-if="!isCompact"
            class="_button"
            :class="$style.item"
            title="AI アシスタント"
            @click="closeDrawerAndDo(navigateToAi)"
          >
            <i class="ti ti-sparkles" />
            <span :class="$style.label">AI</span>
          </button>
        </div>

        <!-- Spacer -->
        <div :class="$style.spacer" />

        <!-- Bottom section: post button → accounts -->
        <div :class="$style.section">
          <!-- Mobile-only: profile & settings -->
          <div v-if="isCompact" :class="$style.mobileOnly">
            <div :class="$style.menuWrap">
              <button
                class="_button"
                :class="$style.item"
                title="プロファイル"
                @pointerdown.stop
                @click.stop="emit('update:showProfileMenu', !props.showProfileMenu)"
              >
                <i class="ti ti-layout" />
                <span :class="$style.label">プロファイル</span>
              </button>
              <DeckProfileMenu :show="props.showProfileMenu" @close="emit('update:showProfileMenu', false)" />
            </div>
            <div :class="$style.menuWrap">
              <button
                class="_button"
                :class="$style.item"
                title="設定"
                @pointerdown.stop
                @click.stop="emit('update:showSettingsMenu', !props.showSettingsMenu)"
              >
                <i class="ti ti-settings" />
                <span :class="$style.label">設定</span>
                <span v-if="props.updateAvailable" :class="$style.updateDot" />
              </button>
              <DeckSettingsMenu :show="props.showSettingsMenu" @close="emit('update:showSettingsMenu', false)" @close-all="emit('update:showSettingsMenu', false); emit('update:mobileDrawerOpen', false)" />
            </div>
          </div>

          <!-- Post button -->
          <button
            class="_button"
            :class="$style.postBtn"
            title="ノート作成"
            @click="closeDrawerAndDo(() => emit('open-compose'))"
          >
            <i class="ti ti-pencil" />
            <span :class="$style.label">ノート</span>
          </button>

          <!-- Account avatars -->
          <div :class="$style.accountStack">
            <div
              v-for="acc in accountsStore.accounts"
              :key="acc.id"
              :class="$style.accountWrap"
            >
              <button
                class="_button"
                :class="$style.accountBtn"
                :title="getAccountLabel(acc)"
                @click.stop="toggleAccountMenu(acc.id)"
              >
                <div :class="$style.avatarWrap">
                  <img
                    v-if="isGuestAccount(acc)"
                    src="/avatar-guest.svg"
                    :class="$style.avatar"
                  />
                  <img
                    v-else-if="acc.avatarUrl"
                    :src="acc.avatarUrl"
                    :class="$style.avatar"
                  />
                  <div v-else :class="[$style.avatar, $style.avatarPlaceholder]" />
                  <img
                    :src="getServerIconUrl(acc.host)"
                    :class="$style.serverBadge"
                    :title="acc.host"
                  />
                  <span
                    :class="[$style.onlineIndicator, onlineStatusClass(acc.id)]"
                  />
                </div>
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
                @logout="showLogoutDialog(acc.id)"
                @relogin="(host: string) => closeDrawerAndDo(() => navigateToLogin(host))"
              />
            </div>
            <button
              class="_button"
              :class="$style.accountBtn"
              title="アカウント追加"
              @click="closeDrawerAndDo(navigateToLogin)"
            >
              <div :class="$style.addAccountIcon">
                <i class="ti ti-plus" />
              </div>
            </button>
          </div>



        </div>
      </div>

      <!-- Collapse toggle -->
      <button v-if="!isCompact" :class="$style.toggle" title="サイドバー切替" @click="toggleNav">
        <i :class="navCollapsed ? 'ti ti-chevron-right' : 'ti ti-chevron-left'" />
      </button>
    </nav>

    <!-- Resize handle -->
    <div
      v-if="!isCompact"
      :class="[$style.resizeHandle, { [$style.resizeActive]: isResizing }]"
      @mousedown="startResize"
    />

    <LogoutDialog
      :show="logoutTargetId != null"
      :is-guest="logoutTargetId ? isGuestAccount(accountsStore.accountMap.get(logoutTargetId) as Account) : false"
      @keep-data="logoutKeepData"
      @delete-all="logoutDeleteAll"
      @cancel="logoutTargetId = null"
    />
  </div>
</template>

<style lang="scss" module>
.wrapper {
  display: contents;
}

// ============================================================
// Left Navbar — base styles (all sizes)
// ============================================================
.navbar {
  flex: 0 0 auto;
  display: flex;
  background: color(from var(--nd-navBg) srgb r g b / 0.5);
  backdrop-filter: blur(var(--nd-blur));
  -webkit-backdrop-filter: blur(var(--nd-blur));
  border-right: 1px solid var(--nd-divider);
  position: relative;
  z-index: 1;
  container-type: inline-size;
  container-name: navbar;
}

.body {
  flex: 1;
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow-y: auto;
  overflow-x: hidden;
  direction: rtl;

  > * {
    direction: ltr;
  }
}

.section {
  display: flex;
  flex-direction: column;
  padding: 10px 16px;
}

.spacer {
  flex: 1;
}

.divider {
  height: 1px;
  background: var(--nd-divider);
  margin: 10px 16px;
}

.item {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 10px 14px;
  border-radius: var(--nd-radius-full);
  color: var(--nd-navFg, var(--nd-fg));
  font-size: 0.9em;
  white-space: nowrap;
  text-decoration: none;
  transition: background var(--nd-duration-base), color var(--nd-duration-base);

  &:hover {
    background: var(--nd-buttonHoverBg);
    color: var(--nd-fgHighlighted);

    .ti {
      opacity: 1;
    }
  }

  .ti {
    flex-shrink: 0;
    opacity: 0.7;
  }
}

.iconWrap {
  position: relative;
  display: inline-flex;
  flex-shrink: 0;
}

.badge {
  position: absolute;
  top: -8px;
  right: -10px;
  min-width: 16px;
  height: 16px;
  padding: 0 4px;
  border-radius: var(--nd-radius-full);
  background: var(--nd-indicator, #e53935);
  color: #fff;
  font-size: 10px;
  font-weight: bold;
  line-height: 16px;
  text-align: center;
  pointer-events: none;
  box-sizing: border-box;
}

.label {
  overflow: hidden;
  text-overflow: ellipsis;
}

// Account buttons — same style as bottom bar tabs
.accountStack {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 4px 0;
}

.accountBtn {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  flex: 0 0 auto;
  padding: 4px;
  border-radius: var(--nd-radius-sm);
  overflow: visible;
  opacity: 0.6;
  transition: opacity var(--nd-duration-base), background var(--nd-duration-base);

  &:hover {
    opacity: 1;
    background: var(--nd-buttonHoverBg);
  }
}

.addAccountIcon {
  width: 26px;
  height: 26px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--nd-buttonBg);
  color: var(--nd-fg);
  font-size: 14px;
}

.avatarWrap {
  position: relative;
  flex-shrink: 0;
}

.avatar {
  width: 26px;
  height: 26px;
  border-radius: 50%;
  object-fit: cover;
  display: block;
}

.avatarPlaceholder {
  background: var(--nd-buttonBg);
}

.serverBadge {
  position: absolute;
  top: -2px;
  right: -3px;
  width: 12px;
  height: 12px;
  border-radius: 50%;
  object-fit: cover;
  border: 1.5px solid var(--nd-navBg);
}

.onlineIndicator {
  position: absolute;
  bottom: 0;
  left: 0;
  width: 20%;
  height: 20%;
  border-radius: 50%;
  box-shadow: 0 0 0 2px var(--nd-navBg);
}

.statusOnline {
  background: var(--nd-statusOnline);
}

.statusActive {
  background: var(--nd-statusActive);
}

.statusOffline {
  background: var(--nd-statusOffline);
}

.statusUnknown {
  background: var(--nd-statusUnknown);
}




.postBtn {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 10px 14px;
  border-radius: var(--nd-radius-full);
  background: linear-gradient(90deg, var(--nd-buttonGradateA, var(--nd-accent)), var(--nd-buttonGradateB, var(--nd-accentDarken)));
  color: var(--nd-fgOnAccent, #fff);
  font-weight: bold;
  font-size: 0.9em;
  white-space: nowrap;
  transition: transform var(--nd-duration-base), box-shadow var(--nd-duration-base);

  &:hover {
    transform: scale(1.03);
    box-shadow: 0 4px 12px color-mix(in srgb, var(--nd-accent) 40%, transparent);
  }

  &:active {
    transform: scale(0.97);
  }
}

.resizeHandle {
  flex: 0 0 6px;
  cursor: col-resize;
  background: transparent;
  transition: background var(--nd-duration-base);
  z-index: 10;

  &:hover,
  &.resizeActive {
    background: var(--nd-accent);
    opacity: 0.4;
  }
}

.resizeActive {
  opacity: 0.6;
}

.toggle {
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
  transition: opacity var(--nd-duration-base);
  z-index: 10;

  .navbar:hover & {
    opacity: 0.5;
  }

  &:hover {
    opacity: 1;
  }
}

.accountWrap {
  // position: static — メニューはaccountStack基準で表示
}

.mobileOnly {
  display: flex;
  flex-direction: column;
}

.menuWrap {
  position: relative;
}

.updateDot {
  position: absolute;
  top: 8px;
  right: 8px;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--nd-accent);
  pointer-events: none;
}

// ============================================================
// Icon-only mode — navbar adapts to its own width via
// Container Query. No class flags needed.
// ============================================================
@container navbar (max-width: 100px) {
  .body {
    overflow: visible;
    direction: ltr;
  }

  .label {
    display: none;
  }

  .item {
    justify-content: center;
    padding: 16px 0;
    width: 100%;
    font-size: 1.4em;
  }

  .account {
    padding: 8px;
    width: auto;
    border-radius: var(--nd-radius-full);
  }

  .accountBtn {
    padding: 6px 0;
  }

  .section {
    padding: 10px 0;
    align-items: center;
  }

  .avatar {
    width: 38px;
    height: 38px;
  }

  .serverBadge {
    width: 16px;
    height: 16px;
    top: -2px;
    right: -4px;
  }

  .postBtn {
    width: 52px;
    height: 52px;
    padding: 0;
    margin: 0 auto;
    border-radius: 50%;
    justify-content: center;
    font-size: 1.3em;
  }
}

// ============================================================
// Drawer mode (mobile platform)
// ============================================================
.drawerMode {
  position: fixed;
  top: 0;
  left: 0;
  bottom: 0;
  z-index: calc(var(--nd-z-navbar) + 1);
  width: 250px !important;
  flex-basis: 250px !important;
  padding-top: max(var(--nd-safe-area-top, env(safe-area-inset-top)), 12px);
  padding-bottom: var(--nd-safe-area-bottom, env(safe-area-inset-bottom));
  transform: translateX(-100%);
  transition: transform 0.25s ease;
  box-shadow: none;
  background: var(--nd-navBg);
  backdrop-filter: none;
  -webkit-backdrop-filter: none;

  .item {
    min-height: 44px;
  }
}

.drawerOpen {
  transform: translateX(0);
  box-shadow: 4px 0 16px rgb(0 0 0 / 0.3);
}
</style>
