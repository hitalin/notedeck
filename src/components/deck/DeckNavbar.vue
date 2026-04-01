<script setup lang="ts">
import { computed, onUnmounted, ref, useCssModule, watch } from 'vue'
import ColumnBadges from '@/components/common/ColumnBadges.vue'
import { COLUMN_ICONS, COLUMN_LABELS } from '@/composables/useColumnTabs'
import { useNavigation } from '@/composables/useNavigation'
import { useUnreadChat } from '@/composables/useUnreadChat'
import { useUnreadNotifications } from '@/composables/useUnreadNotifications'
import {
  type Account,
  getAccountLabel,
  isGuestAccount,
  useAccountsStore,
} from '@/stores/accounts'
import { useConfirm } from '@/stores/confirm'
import { isNavDivider, type NavItem, useDeckStore } from '@/stores/deck'
import { useOfflineModeStore } from '@/stores/offlineMode'
import { useRealtimeModeStore } from '@/stores/realtimeMode'
import { useServersStore } from '@/stores/servers'
import { useStreamingStore } from '@/stores/streaming'
import { useIsCompactLayout } from '@/stores/ui'
import { useWindowsStore } from '@/stores/windows'
import {
  clearAvailableTlCache,
  detectAvailableTimelines,
} from '@/utils/customTimelines'
import { AppError } from '@/utils/errors'
import { hapticLight, hapticMedium } from '@/utils/haptics'
import { proxyThumbUrl } from '@/utils/imageProxy'
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
const { navigateToLogin, navigateToPlugins } = useNavigation()
const { confirm } = useConfirm()
const deckStore = useDeckStore()
const offlineModeStore = useOfflineModeStore()
const realtimeModeStore = useRealtimeModeStore()
const windowsStore = useWindowsStore()
const isCompact = useIsCompactLayout()
const { totalUnread, markAllAsRead } = useUnreadNotifications()
const { totalUnread: chatUnread, resetAll: resetChatUnread } = useUnreadChat()

async function toggleOfflineMode() {
  const isOn = offlineModeStore.isOfflineMode
  const ok = await confirm({
    title: isOn ? 'オフラインモードを解除' : 'オフラインモードに切替',
    message: isOn
      ? 'サーバーに再接続します。'
      : 'すべての通信を停止し、キャッシュ済みデータのみ表示します。',
    okLabel: isOn ? '解除' : '切替',
    cancelLabel: 'キャンセル',
  })
  if (ok) await offlineModeStore.toggle()
}

async function toggleRealtimeMode() {
  const isRealtime = realtimeModeStore.isRealtime
  const ok = await confirm({
    title: isRealtime ? 'ポーリングモードに切替' : 'リアルタイムモードに切替',
    message: isRealtime
      ? 'WebSocket接続を切断し、定期的なHTTPポーリングに切り替えます。'
      : 'リアルタイム更新に切り替えます。',
    okLabel: '切替',
    cancelLabel: 'キャンセル',
  })
  if (ok) realtimeModeStore.toggle()
}

const sidebarType = computed(() => {
  const col = deckStore.columns.find((c) => c.sidebar)
  return col?.type ?? null
})

function navIcon(type: string): string {
  return `ti-${COLUMN_ICONS[type] ?? 'layout-grid'}`
}

function navLabel(type: string): string {
  return COLUMN_LABELS[type] ?? type
}

function getNavAction(item: NavItem): () => void {
  if (isNavDivider(item))
    return () => {
      /* divider has no action */
    }
  return () => {
    if (item.type === 'notifications') markAllAsRead()
    if (item.type === 'chat') resetChatUnread()
    deckStore.toggleSidebarColumn(item.type, item.accountId)
  }
}

function getNavBadge(item: NavItem): number {
  if (isNavDivider(item)) return 0
  switch (item.type) {
    case 'notifications':
      return totalUnread.value
    case 'chat':
      return chatUnread.value
    default:
      return 0
  }
}

function closeDrawerAndDo(fn: () => void) {
  emit('update:mobileDrawerOpen', false)
  fn()
}
const accountsStore = useAccountsStore()
const serversStore = useServersStore()
const streamingStore = useStreamingStore()

function getServerIconUrl(host: string): string | undefined {
  const url =
    serversStore.getServer(host)?.iconUrl || `https://${host}/favicon.ico`
  return proxyThumbUrl(url, 28)
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
const MIN_WIDTH = 56
const COLLAPSE_THRESHOLD = 120
const DEFAULT_WIDTH = 220
const MAX_WIDTH = 400
const navWidth = ref(
  document.documentElement.clientWidth <= 1279 ? MIN_WIDTH : DEFAULT_WIDTH,
)
const isResizing = ref(false)
const subButtonsHovered = ref(false)
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
    accountsStore.bumpModeVersion(accountId)
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

let resizeRafId = 0
function onResize(e: MouseEvent) {
  cancelAnimationFrame(resizeRafId)
  resizeRafId = requestAnimationFrame(() => {
    const w = e.clientX
    if (w <= COLLAPSE_THRESHOLD) {
      navWidth.value = MIN_WIDTH
    } else {
      navWidth.value = Math.min(w, MAX_WIDTH)
    }
  })
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
        <!-- Top header -->
        <div :class="$style.top">
          <button
            class="_button"
            :class="$style.instanceBtn"
            title="NoteDeck について"
            @click="windowsStore.open('about')"
          >
            <img src="/favicon.svg" :class="$style.instanceIcon" alt="NoteDeck" />
            <span v-if="props.updateAvailable" :class="$style.updateDot" />
          </button>
          <button
            v-if="!navCollapsed && !isCompact"
            class="_button"
            :class="[$style.topBtn, offlineModeStore.isOfflineMode ? $style.offlineActive : $style.onlineActive]"
            :title="offlineModeStore.isOfflineMode ? 'オンラインモードに切り替え' : 'オフラインモードに切り替え'"
            @click="hapticLight(); toggleOfflineMode()"
          >
            <i :class="offlineModeStore.isOfflineMode ? 'ti ti-wifi-off' : 'ti ti-wifi'" />
          </button>
          <button
            v-if="!navCollapsed && !isCompact"
            class="_button"
            :class="[$style.topBtn, realtimeModeStore.enabled ? $style.realtimeActive : $style.pollingActive, { [$style.itemDisabled]: offlineModeStore.isOfflineMode }]"
            :disabled="offlineModeStore.isOfflineMode"
            :title="realtimeModeStore.enabled ? 'ポーリングモードに切り替え' : 'リアルタイムモードに切り替え'"
            @click="hapticLight(); toggleRealtimeMode()"
          >
            <i :class="realtimeModeStore.enabled ? 'ti ti-bolt' : 'ti ti-bolt-off'" />
          </button>
        </div>

        <!-- Nav items (scrollable) -->
        <div :class="$style.topScroll">
          <div :class="$style.section">
            <template v-for="(navItem, navIdx) in deckStore.navItems" :key="navIdx">
              <div v-if="isNavDivider(navItem)" :class="$style.divider" />
              <button
                v-else
                class="_button"
                :class="[$style.item, { [$style.sidebarActive]: sidebarType === navItem.type }]"
                :title="navLabel(navItem.type)"
                @click="hapticLight(); closeDrawerAndDo(getNavAction(navItem))"
              >
                <div :class="$style.iconWrap">
                  <i :class="['ti', navIcon(navItem.type)]" />
                  <span v-if="getNavBadge(navItem) > 0" :key="getNavBadge(navItem)" :class="$style.badge">{{ getNavBadge(navItem) > 99 ? '99+' : getNavBadge(navItem) }}</span>
                  <ColumnBadges :account-id="navItem.accountId" :size="12" />
                </div>
                <span :class="$style.label">{{ navLabel(navItem.type) }}</span>
              </button>
            </template>
          </div>
        </div>

        <!-- Bottom fixed section: buttons -->
        <div :class="[$style.section, $style.bottomSection]">
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
              </button>
              <DeckSettingsMenu :show="props.showSettingsMenu" @close="emit('update:showSettingsMenu', false)" @close-all="emit('update:showSettingsMenu', false); emit('update:mobileDrawerOpen', false)" />
            </div>
          </div>
          <div v-if="isCompact" :class="$style.divider" />

          <!-- Offline/Realtime mode (collapsed & mobile only) -->
          <template v-if="navCollapsed || isCompact">
            <button
              class="_button"
              :class="[$style.item, offlineModeStore.isOfflineMode ? $style.offlineActive : $style.onlineActive]"
              :title="offlineModeStore.isOfflineMode ? 'オンラインモードに切り替え' : 'オフラインモードに切り替え'"
              @click="hapticLight(); toggleOfflineMode()"
            >
              <div :class="$style.iconWrap">
                <i :class="offlineModeStore.isOfflineMode ? 'ti ti-wifi-off' : 'ti ti-wifi'" />
              </div>
              <span :class="$style.label">{{ offlineModeStore.isOfflineMode ? 'オフライン' : 'オンライン' }}</span>
            </button>
            <button
              class="_button"
              :class="[$style.item, realtimeModeStore.enabled ? $style.realtimeActive : $style.pollingActive, { [$style.itemDisabled]: offlineModeStore.isOfflineMode }]"
              :disabled="offlineModeStore.isOfflineMode"
              :title="realtimeModeStore.enabled ? 'ポーリングモードに切り替え' : 'リアルタイムモードに切り替え'"
              @click="hapticLight(); toggleRealtimeMode()"
            >
              <div :class="$style.iconWrap">
                <i :class="realtimeModeStore.enabled ? 'ti ti-bolt' : 'ti ti-bolt-off'" />
              </div>
              <span :class="$style.label">{{ realtimeModeStore.enabled ? 'リアルタイム' : 'ポーリング' }}</span>
            </button>
          </template>

          <!-- Post button -->
          <button
            class="_button"
            :class="$style.postBtn"
            title="ノート作成"
            @click="hapticMedium(); closeDrawerAndDo(() => emit('open-compose'))"
          >
            <i class="ti ti-pencil" />
            <span :class="$style.label">ノート</span>
          </button>
        </div>

        <!-- Account avatars (scrollable) -->
        <div :class="$style.accountSection">
          <div :class="$style.accountStack">
            <div :class="$style.accountScroll">
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
                      :src="proxyThumbUrl(acc.avatarUrl, 56)"
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
                  @close="accountMenuId = null"
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
      </div>

      <!-- Sub buttons (protruding tab) -->
      <div v-if="!isCompact" :class="$style.subButtons" @mouseenter="subButtonsHovered = true" @mouseleave="subButtonsHovered = false">
        <div :class="$style.subButton">
          <svg viewBox="0 0 16 64" :class="$style.subButtonShape">
            <g transform="matrix(0.333333,0,0,0.222222,0.000895785,21.3333)">
              <path d="M47.488,7.995C47.79,10.11 47.943,12.266 47.943,14.429C47.997,26.989 47.997,84 47.997,84C47.997,84 44.018,118.246 23.997,133.5C-0.374,152.07 -0.003,192 -0.003,192L-0.003,-96C-0.003,-96 0.151,-56.216 23.997,-37.5C40.861,-24.265 46.043,-1.243 47.488,7.995Z" fill="var(--nd-navBg)" />
            </g>
          </svg>
          <button class="_button" :class="$style.subButtonClickable" title="ナビバー編集" @click="windowsStore.open('navEditor')">
            <i class="ti ti-settings-2" :class="$style.subButtonIcon" />
          </button>
        </div>
        <div :class="$style.subButtonGapFill" />
        <div :class="$style.subButtonGapFillDivider" />
        <div :class="$style.subButton">
          <svg viewBox="0 0 16 64" :class="$style.subButtonShape">
            <g transform="matrix(0.333333,0,0,0.222222,0.000895785,21.3333)">
              <path d="M47.488,7.995C47.79,10.11 47.943,12.266 47.943,14.429C47.997,26.989 47.997,84 47.997,84C47.997,84 44.018,118.246 23.997,133.5C-0.374,152.07 -0.003,192 -0.003,192L-0.003,-96C-0.003,-96 0.151,-56.216 23.997,-37.5C40.861,-24.265 46.043,-1.243 47.488,7.995Z" fill="var(--nd-navBg)" />
            </g>
          </svg>
          <button class="_button" :class="$style.subButtonClickable" title="サイドバー切替" @click="toggleNav">
            <i :class="[navCollapsed ? 'ti ti-chevron-right' : 'ti ti-chevron-left', $style.subButtonIcon]" />
          </button>
        </div>
      </div>
    </nav>

    <!-- Resize handle -->
    <div
      v-if="!isCompact"
      :class="[$style.resizeHandle, { [$style.resizeActive]: isResizing }]"
      :style="subButtonsHovered ? { pointerEvents: 'none' } : undefined"
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
@use '@/styles/buttons' as *;

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
  backdrop-filter: var(--nd-vibrancy);
  -webkit-backdrop-filter: var(--nd-vibrancy);
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
  min-height: 0;
  overflow: hidden;
  direction: rtl;

  > * {
    direction: ltr;
  }
}

.top {
  position: sticky;
  top: 0;
  z-index: 1;
  display: flex;
  height: 44px;
  flex-shrink: 0;
}

.instanceBtn {
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: 1;
}

.instanceIcon {
  width: 28px;
  aspect-ratio: 1;
  border-radius: 6px;
}

.topBtn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: 1;
  color: var(--nd-navFg, var(--nd-fg));

  :global(.ti) {
    font-size: 28px;
    opacity: 0.7;
  }

  &:hover :global(.ti) {
    opacity: 1;
  }
}

.topScroll {
  flex: 1;
  min-height: 0;
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
  padding: 10px 6px;
}

.bottomSection {
  flex-shrink: 0;
}

.accountSection {
  flex-shrink: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  padding: 0 6px 10px;
}


.divider {
  height: 1px;
  background: var(--nd-divider);
  margin: 10px 6px;
  align-self: stretch;
}

.item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0 14px;
  line-height: 2.85rem;
  border-radius: var(--nd-radius-full);
  color: var(--nd-navFg, var(--nd-fg));
  font-size: 0.95em;
  white-space: nowrap;
  text-decoration: none;
  transition: background var(--nd-duration-base), color var(--nd-duration-base), transform var(--nd-duration-fast) var(--nd-ease-spring);

  &:hover {
    background: var(--nd-buttonHoverBg);
    color: var(--nd-fgHighlighted);

    :global(.ti) {
      opacity: 1;
    }
  }

  :global(.ti) {
    flex-shrink: 0;
    width: 32px;
    font-size: 1.5em;
    text-align: center;
    opacity: 0.7;
  }
}

.sidebarActive {
  background: var(--nd-buttonHoverBg);
  color: var(--nd-fgHighlighted);

  :global(.ti) {
    opacity: 1;
  }
}

.onlineActive {
  color: #86b300;

  :global(.ti) {
    opacity: 1;
  }
}

.offlineActive {
  color: #d32f2f;

  :global(.ti) {
    opacity: 1;
  }
}

.realtimeActive {
  color: #e2a100;

  :global(.ti) {
    opacity: 1;
  }
}

.pollingActive {
  color: #9c27b0;

  :global(.ti) {
    opacity: 1;
  }
}

.itemDisabled {
  opacity: 0.35;
  pointer-events: none;
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
  animation: nd-badge-in 0.7s ease both;
}

/* Misskey global-bounce style: 3-step overshoot for satisfying pop-in */
@keyframes nd-badge-in {
  0%   { transform: scale(0); opacity: 0; }
  19%  { transform: scale(1.15); opacity: 1; }
  48%  { transform: scale(0.95); }
  100% { transform: scale(1); }
}

.label {
  overflow: hidden;
  text-overflow: ellipsis;
}

// Account buttons
.accountStack {
  position: relative;
  margin-top: 8px;
  flex: 1;
  min-height: 0;
}

.accountScroll {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 4px 4px;
  overflow-x: auto;
  scrollbar-width: none;

  &::-webkit-scrollbar {
    display: none;
  }
}

.accountBtn {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  flex: 0 0 auto;
  padding: 6px;
  border-radius: var(--nd-radius-sm);
  overflow: visible;
  opacity: 0.6;
  transition: opacity var(--nd-duration-base), background var(--nd-duration-base), transform var(--nd-duration-fast) var(--nd-ease-spring);

  &:hover {
    opacity: 1;
    background: var(--nd-buttonHoverBg);
  }

  &:active {
    transform: scale(0.95);
  }
}

.addAccountIcon {
  width: 32px;
  height: 32px;
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
  width: 32px;
  height: 32px;
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
  right: -4px;
  width: 14px;
  height: 14px;
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
  transition: transform var(--nd-duration-fast) var(--nd-ease-spring), box-shadow var(--nd-duration-base);

  &:hover {
    transform: scale(1.03);
    box-shadow: 0 4px 12px color-mix(in srgb, var(--nd-accent) 40%, transparent);
  }

  &:active {
    transform: scale(var(--nd-active-scale));
  }

  :global(.ti) {
    flex-shrink: 0;
    width: 32px;
    font-size: 1.5em;
    text-align: center;
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

.subButtons {
  --sub-button-width: 20px;

  position: absolute;
  right: 0;
  bottom: 80px;
  translate: 100% 0;
  z-index: 11;
}

.subButton {
  display: block;
  position: relative;
  width: var(--sub-button-width);
  height: 50px;
  align-content: center;
}

.subButtonShape {
  position: absolute;
  z-index: 0;
  top: 0;
  bottom: 0;
  left: 0;
  margin: auto;
  width: var(--sub-button-width);
  height: calc(var(--sub-button-width) * 4);
  pointer-events: none;
}

.subButtonClickable {
  position: absolute;
  z-index: 1;
  display: block;
  max-width: unset;
  width: 24px;
  height: 42px;
  top: 0;
  bottom: 0;
  left: -4px;
  margin: auto;
  font-size: 13px;
  color: var(--nd-navFg, var(--nd-fg));
  cursor: pointer;

  :global(.ti) {
    opacity: 0.7;
  }

  &:hover :global(.ti) {
    opacity: 1;
  }
}

.subButtonIcon {
  margin-left: -4px;
}

.subButtonGapFill {
  position: relative;
  width: var(--sub-button-width);
  height: 64px;
  margin-top: -32px;
  margin-bottom: -32px;
  pointer-events: none;
  background: var(--nd-navBg);
}

.subButtonGapFillDivider {
  position: relative;
  z-index: 1;
  margin-left: -2px;
  width: 14px;
  height: 1px;
  background: var(--nd-divider);
  pointer-events: none;
}

.accountWrap {
  // 展開時: position: static → メニューはaccountStack基準
  // 折りたたみ時: position: relative → メニューはアカウント位置基準（コンテナクエリで切替）
}

.mobileOnly {
  display: flex;
  flex-direction: column;
}

.menuWrap {
  position: relative;
}

.updateDot { @include update-dot; }

// ============================================================
// Icon-only mode — navbar adapts to its own width via
// Container Query. No class flags needed.
// ============================================================
@container navbar (max-width: 80px) {
  .body {
    overflow: visible;
    direction: ltr;
  }

  .label {
    display: none;
  }

  .top {
    padding-left: 0;
    justify-content: center;
  }

  .instanceIcon {
    width: 30px;
    border-radius: 6px;
  }

  .item {
    justify-content: center;
    padding: 0;
    width: 44px;
    height: 44px;
    margin: 2px auto;
    border-radius: 50%;
    font-size: 1rem;

    :global(.ti) {
      font-size: 1.5em;
    }
  }

  .account {
    padding: 8px;
    width: auto;
    border-radius: var(--nd-radius-full);
  }

  .accountStack {
    position: static;
    margin-top: 0;
    overflow-y: auto;
    overflow-x: visible;
    scrollbar-width: none;

    &::-webkit-scrollbar {
      display: none;
    }
  }

  .accountScroll {
    flex-direction: column;
    overflow: visible;
    gap: 4px;
  }

  .accountWrap {
    position: relative;
  }

  .accountBtn {
    padding: 4px;
    border-radius: 50%;
  }

  .section {
    padding: 8px 0 0;
    align-items: center;
  }

  .avatar {
    width: 32px;
    height: 32px;
  }

  .serverBadge {
    width: 16px;
    height: 16px;
    top: -2px;
    right: -4px;
  }

  .postBtn {
    width: 44px;
    height: 44px;
    padding: 0;
    margin: 0 auto;
    border-radius: 50%;
    justify-content: center;
    font-size: 1rem;

    :global(.ti) {
      font-size: 1.5em;
    }
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
  translate: -100% 0;
  transition: translate 0.15s ease;
  box-shadow: none;
  background: var(--nd-navBg);
  backdrop-filter: none;
  -webkit-backdrop-filter: none;

  .item {
    min-height: 44px;
  }
}

.drawerOpen {
  translate: 0 0;
  box-shadow: 4px 0 16px rgb(0 0 0 / 0.3);
}
</style>
