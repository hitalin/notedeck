<script setup lang="ts">
import { invoke } from '@tauri-apps/api/core'
import { openUrl } from '@tauri-apps/plugin-opener'
import { computed, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useAccountsStore } from '@/stores/accounts'
import { useDeckStore } from '@/stores/deck'
import {
  clearAvailableTlCache,
  detectAvailableTimelines,
} from '@/utils/customTimelines'
import { AppError } from '@/utils/errors'

const props = defineProps<{
  mobileDrawerOpen: boolean
}>()

const emit = defineEmits<{
  'open-compose': []
  'update:mobileDrawerOpen': [value: boolean]
}>()

const router = useRouter()
const deckStore = useDeckStore()
const accountsStore = useAccountsStore()

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
  for (const col of deckStore.columns) {
    if (col.accountId === id) {
      deckStore.removeColumn(col.id)
    }
  }
  accountsStore.removeAccount(id)
  accountMenuId.value = null
}

function modeLabel(key: string): string {
  const match = key.match(/^isIn(.+)Mode$/)
  if (!match) return key
  return `${match[1]} mode`
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
                <button class="_button nav-account-menu-item" @click="router.push(`/user/${acc.id}/${acc.userId}`)">
                  <span>Profile</span>
                  <i class="ti ti-user" />
                </button>
                <button class="_button nav-account-menu-item" @click="openUrl(`https://${acc.host}/admin`)">
                  <span>Admin</span>
                  <i class="ti ti-external-link" />
                </button>
                <button class="_button nav-account-menu-item" @click="openUrl(`https://${acc.host}/my/drive`)">
                  <span>Drive</span>
                  <i class="ti ti-external-link" />
                </button>
                <button class="_button nav-account-menu-item" @click="openUrl(`https://${acc.host}/pages`)">
                  <span>Pages</span>
                  <i class="ti ti-external-link" />
                </button>
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

.navbar:hover .nav-toggle {
  opacity: 0.5;
}

.nav-toggle:hover {
  opacity: 1 !important;
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
  .navbar.drawer-open .nav-account-menu.menu-right {
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
