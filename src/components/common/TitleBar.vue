<script setup lang="ts">
import { getCurrentWebview } from '@tauri-apps/api/webview'
import { getCurrentWindow, LogicalSize } from '@tauri-apps/api/window'
import {
  computed,
  defineAsyncComponent,
  onMounted,
  onUnmounted,
  ref,
} from 'vue'
import { useCommandStore } from '@/commands/registry'
import { useColumnHistory } from '@/composables/useColumnHistory'
import { openDeckWindow } from '@/composables/useDeckWindow'
import { openPipWindow } from '@/composables/usePipWindow'
import { usePortal } from '@/composables/usePortal'
import { useVaporTransition } from '@/composables/useVaporTransition'
import { useAccountsStore } from '@/stores/accounts'
import { useDeckStore } from '@/stores/deck'
import { useIsCompactLayout, useUiStore } from '@/stores/ui'

const CommandPalette = defineAsyncComponent(
  () => import('@/components/common/CommandPalette.vue'),
)

const appWindow = getCurrentWindow()
const commandStore = useCommandStore()
const accountsStore = useAccountsStore()
const deckStore = useDeckStore()
const { platformName, isDesktop } = useUiStore()
const isCompact = useIsCompactLayout()
const { canGoBack, canGoForward, goBack, goForward } = useColumnHistory()

const platformLabel: Record<string, string> = {
  windows: 'Windows',
  macos: 'macOS',
  linux: 'Linux',
  android: 'Android',
  ios: 'iOS',
}

const titleBarText = computed(() => {
  if (deckStore.activeColumnUri) return deckStore.activeColumnUri
  const parts: string[] = []
  if (platformName) parts.push(platformLabel[platformName] ?? platformName)
  if (deckStore.currentProfileName) parts.push(deckStore.currentProfileName)
  const suffix = parts.length ? ` [${parts.join(': ')}]` : ''
  return `NoteDeck${suffix}`
})
const isMaximized = ref(false)
const isCompactSize = ref(false)

const MOBILE_WIDTH = 420
const MOBILE_HEIGHT = 780

let savedDesktopSize: { width: number; height: number } | null = null

async function syncMaximized() {
  isMaximized.value = await appWindow.isMaximized()
}

async function syncMobileState() {
  const factor = await appWindow.scaleFactor()
  const size = await appWindow.innerSize()
  const logicalWidth = size.width / factor
  isCompactSize.value = logicalWidth <= MOBILE_WIDTH + 20
}

let unlisten: (() => void) | null = null

onMounted(async () => {
  await syncMaximized()
  await syncMobileState()
  unlisten = await appWindow.onResized(async () => {
    await syncMaximized()
    await syncMobileState()
  })
})

onUnmounted(() => {
  unlisten?.()
})

async function minimize() {
  await appWindow.minimize()
}

async function toggleMaximize() {
  await appWindow.toggleMaximize()
}

async function close() {
  await appWindow.close()
}

async function toggleMobileSize() {
  if (isCompactSize.value) {
    if (savedDesktopSize) {
      await appWindow.setSize(
        new LogicalSize(savedDesktopSize.width, savedDesktopSize.height),
      )
    } else {
      await appWindow.setSize(new LogicalSize(1200, 800))
    }
    savedDesktopSize = null
  } else {
    // Exit fullscreen or unmaximize first
    if (await appWindow.isFullscreen()) {
      await appWindow.setFullscreen(false)
    } else if (isMaximized.value) {
      await appWindow.unmaximize()
    }
    const factor = await appWindow.scaleFactor()
    const current = await appWindow.innerSize()
    savedDesktopSize = {
      width: current.width / factor,
      height: current.height / factor,
    }
    await appWindow.setSize(new LogicalSize(MOBILE_WIDTH, MOBILE_HEIGHT))
  }
  await appWindow.center()
}

function openNewWindow() {
  if (!deckStore.windowProfileId) return
  openDeckWindow(deckStore.windowProfileId)
}

async function onPipClick() {
  await openPipWindow()
}

// ── Hamburger menu ──
const menuOpen = ref(false)
const activeCategory = ref<string | null>(null)
const {
  visible: menuVisible,
  entering: menuEntering,
  leaving: menuLeaving,
} = useVaporTransition(menuOpen, { enterDuration: 200, leaveDuration: 200 })

const menuPortalRef = ref<HTMLElement | null>(null)
usePortal(menuPortalRef)

function toggleMenu() {
  menuOpen.value = !menuOpen.value
  if (!menuOpen.value) activeCategory.value = null
}

function closeMenu() {
  menuOpen.value = false
  activeCategory.value = null
  clearConeGuard()
}

// Prediction cone: サブメニューへの斜め移動中は切り替えを抑制
const menuPanelRef = ref<HTMLElement | null>(null)
const coneGuardRef = ref<HTMLElement | null>(null)
let lastCursor = { x: 0, y: 0 }

function onCategoryEnter(cat: string) {
  if (activeCategory.value && activeCategory.value !== cat) {
    // サブメニューが開いている状態で別カテゴリに入った場合、
    // カーソルがガード三角形内なら無視
    if (coneGuardRef.value) return
  }
  activeCategory.value = cat
}

function onMenuMouseMove(e: MouseEvent) {
  lastCursor = { x: e.clientX, y: e.clientY }

  if (!activeCategory.value || !menuPanelRef.value) {
    clearConeGuard()
    return
  }

  const panel = menuPanelRef.value.getBoundingClientRect()
  const subRight = panel.right + 220
  const subTop = 0
  const subBottom = window.innerHeight

  // カーソル → サブメニュー右上・右下で三角形を構成
  const cx = e.clientX - panel.left
  const cy = e.clientY - panel.top
  const rtX = subRight - panel.left
  const rtY = subTop - panel.top
  const rbY = subBottom - panel.top

  if (!coneGuardRef.value) {
    const guard = document.createElement('div')
    guard.style.cssText =
      'position:absolute;inset:0;pointer-events:auto;z-index:1;'
    menuPanelRef.value.appendChild(guard)
    coneGuardRef.value = guard
    guard.addEventListener('mousemove', onGuardMove)
    guard.addEventListener('mouseleave', clearConeGuard)
  }

  coneGuardRef.value.style.clipPath = `polygon(${cx}px ${cy}px, ${rtX}px ${rtY}px, ${rtX}px ${rbY}px)`
}

function onGuardMove(e: MouseEvent) {
  if (!menuPanelRef.value) return
  const panel = menuPanelRef.value.getBoundingClientRect()
  // ガード内でもカテゴリアイテム上に留まったら再評価
  const el = document.elementFromPoint(e.clientX, e.clientY)
  if (el && el !== coneGuardRef.value) {
    clearConeGuard()
  }
}

function clearConeGuard() {
  if (coneGuardRef.value) {
    coneGuardRef.value.remove()
    coneGuardRef.value = null
  }
}

function execCommand(cmd: string) {
  document.execCommand(cmd)
  closeMenu()
}

const zoomLevel = ref(1)

async function setZoom(delta: number) {
  zoomLevel.value =
    Math.round(Math.max(0.5, Math.min(2, zoomLevel.value + delta)) * 100) / 100
  await getCurrentWebview().setZoom(zoomLevel.value)
}

function reloadApp() {
  closeMenu()
  window.location.reload()
}
</script>

<template>
  <div :class="$style.titlebar" data-tauri-drag-region>
    <div :class="$style.titlebarLeft" data-tauri-drag-region>
      <button :class="$style.titlebarBtn" title="メニュー" @click="toggleMenu">
        <i class="ti ti-menu-2" />
      </button>
    </div>
    <div
      v-if="menuVisible"
      ref="menuPortalRef"
      :class="[$style.menuBackdrop, menuEntering && $style.menuEnter, menuLeaving && $style.menuLeave]"
      @click="closeMenu"
    >
      <div ref="menuPanelRef" :class="$style.menuPanel" @click.stop @mousemove="onMenuMouseMove">
        <div
          :class="$style.menuCategoryItem"
          @mouseenter="onCategoryEnter('edit')"
          @click="onCategoryEnter('edit')"
        >
          <button class="_popupItem" :class="[activeCategory === 'edit' && $style.menuItemActive]">
            <i class="ti ti-pencil" />
            <span>編集</span>
            <i class="ti ti-chevron-right" :class="$style.menuChevron" />
          </button>
          <div v-if="activeCategory === 'edit'" :class="$style.menuSub">
            <button class="_popupItem" @click="execCommand('cut')">
              <i class="ti ti-cut" />
              <span>切り取り</span>
              <kbd :class="$style.menuKbd">Ctrl+X</kbd>
            </button>
            <button class="_popupItem" @click="execCommand('copy')">
              <i class="ti ti-copy" />
              <span>コピー</span>
              <kbd :class="$style.menuKbd">Ctrl+C</kbd>
            </button>
            <button class="_popupItem" @click="execCommand('paste')">
              <i class="ti ti-clipboard" />
              <span>貼り付け</span>
              <kbd :class="$style.menuKbd">Ctrl+V</kbd>
            </button>
          </div>
        </div>
        <div
          :class="$style.menuCategoryItem"
          @mouseenter="onCategoryEnter('view')"
          @click="onCategoryEnter('view')"
        >
          <button class="_popupItem" :class="[activeCategory === 'view' && $style.menuItemActive]">
            <i class="ti ti-layout" />
            <span>表示</span>
            <i class="ti ti-chevron-right" :class="$style.menuChevron" />
          </button>
          <div v-if="activeCategory === 'view'" :class="$style.menuSub">
            <button class="_popupItem" @click="setZoom(0.1)">
              <i class="ti ti-zoom-in" />
              <span>拡大</span>
              <kbd :class="$style.menuKbd">Ctrl++</kbd>
            </button>
            <button class="_popupItem" @click="setZoom(-0.1)">
              <i class="ti ti-zoom-out" />
              <span>縮小</span>
              <kbd :class="$style.menuKbd">Ctrl+-</kbd>
            </button>
            <div class="_popupDivider" />
            <button class="_popupItem" @click="reloadApp">
              <i class="ti ti-refresh" />
              <span>再読み込み</span>
              <kbd :class="$style.menuKbd">Ctrl+Shift+R</kbd>
            </button>
          </div>
        </div>
      </div>
    </div>
    <div v-if="!isCompact" :class="$style.titlebarCenter" data-tauri-drag-region>
      <div :class="$style.navButtons">
        <button
          :class="[$style.navBtn, { [$style.navBtnDisabled]: !canGoBack }]"
          :disabled="!canGoBack"
          title="戻る"
          @click="goBack"
        >
          <i class="ti ti-arrow-left" />
        </button>
        <button
          :class="[$style.navBtn, { [$style.navBtnDisabled]: !canGoForward }]"
          :disabled="!canGoForward"
          title="進む"
          @click="goForward"
        >
          <i class="ti ti-arrow-right" />
        </button>
        <button
          :class="$style.navBtn"
          title="リロード"
          @click="deckStore.refreshActiveColumn()"
        >
          <i class="ti ti-reload" />
        </button>
      </div>
      <!-- Open: command palette input replaces the search bar -->
      <CommandPalette v-if="commandStore.isOpen" :class="$style.centerBar" />
      <!-- Closed: URI display / search trigger -->
      <button v-else :class="[$style.titlebarSearchBar, $style.centerBar]" @click="commandStore.open()">
        <i :class="[$style.titlebarSearchIcon, 'ti', 'ti-search']" />
        <span :class="[$style.titlebarSearchText, { [$style.hasUri]: deckStore.activeColumnUri }]">{{ titleBarText }}</span>
        <kbd :class="$style.titlebarSearchKbd">Ctrl+K</kbd>
      </button>
    </div>
    <div :class="$style.titlebarControls">
      <template v-if="isDesktop">
        <button
          :class="[$style.titlebarBtn, $style.titlebarWindowBtn]"
          title="開発者ツール"
          @click="commandStore.execute('devtools')"
        >
          <i class="ti ti-code" />
        </button>
        <button
          :class="[$style.titlebarBtn, $style.titlebarWindowBtn]"
          title="新しいウィンドウ"
          @click="openNewWindow"
        >
          <i class="ti ti-app-window" />
        </button>
        <button
          :class="[$style.titlebarBtn, $style.titlebarWindowBtn]"
          title="ピクチャーインピクチャー"
          @click="onPipClick"
        >
          <i class="ti ti-picture-in-picture" />
        </button>
        <button
          :class="[$style.titlebarBtn, $style.titlebarWindowBtn]"
          :title="isCompactSize ? 'デスクトップサイズ' : 'モバイルサイズ'"
          @click="toggleMobileSize"
        >
          <i :class="isCompactSize ? 'ti ti-device-desktop' : 'ti ti-device-mobile'" />
        </button>
      </template>
      <template v-if="isDesktop">
        <button :class="[$style.titlebarBtn, $style.titlebarWindowBtn]" title="最小化" @click="minimize">
          <svg width="10" height="10" viewBox="0 0 10 10">
            <rect x="0" y="4.5" width="10" height="1" fill="currentColor" />
          </svg>
        </button>
        <button :class="[$style.titlebarBtn, $style.titlebarWindowBtn]" title="最大化" @click="toggleMaximize">
          <svg v-if="!isMaximized" width="10" height="10" viewBox="0 0 10 10">
            <rect x="0.5" y="0.5" width="9" height="9" rx="1" stroke="currentColor" stroke-width="1" fill="none" />
          </svg>
          <svg v-else width="10" height="10" viewBox="0 0 10 10">
            <rect x="2.5" y="0.5" width="7" height="7" rx="1" stroke="currentColor" stroke-width="1" fill="none" />
            <rect x="0.5" y="2.5" width="7" height="7" rx="1" stroke="currentColor" stroke-width="1" fill="var(--nd-navBg, #1a1a2e)" />
          </svg>
        </button>
        <button :class="[$style.titlebarBtn, $style.titlebarBtnClose]" title="閉じる" @click="close">
          <svg width="10" height="10" viewBox="0 0 10 10">
            <path d="M1 1L9 9M9 1L1 9" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" />
          </svg>
        </button>
      </template>
    </div>
  </div>
</template>

<style lang="scss" module>
.titlebar {
  display: flex;
  align-items: center;
  height: 32px;
  background: color-mix(in srgb, var(--nd-navBg) 50%, var(--nd-deckBg, #1a1a1a));
  user-select: none;
  flex-shrink: 0;
}

.titlebarLeft {
  display: flex;
  align-items: center;
  height: 100%;
  flex: 1;
}

.navButtons {
  position: absolute;
  right: 100%;
  top: 0;
  display: flex;
  align-items: center;
  height: 100%;
}

.navBtn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 46px;
  height: 100%;
  border: none;
  background: transparent;
  color: var(--nd-fg);
  opacity: 0.6;
  cursor: pointer;
  transition: background var(--nd-duration-fast), opacity var(--nd-duration-fast);

  &:hover:not(:disabled) {
    opacity: 1;
    background: var(--nd-buttonHoverBg);
  }
}

.navBtnDisabled {
  opacity: 0.2;
  cursor: default;
}


.titlebarCenter {
  display: flex;
  align-items: center;
  justify-content: center;
  min-width: 0;
  max-width: 600px;
  width: 600px;
  height: 100%;
  padding: 0 12px;
  position: relative;
  flex-shrink: 1;
}

.centerBar {
  flex: 1;
  min-width: 0;
}

.titlebarSearchBar {
  display: flex;
  align-items: center;
  gap: 6px;
  width: 100%;
  height: 22px;
  padding: 0 8px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: var(--nd-radius-sm);
  background: rgba(255, 255, 255, 0.05);
  color: var(--nd-fg);
  cursor: pointer;
  font-family: inherit;
  font-size: 12px;
  transition:
    background 0.15s,
    border-color 0.15s;

  &:hover {
    background: rgba(255, 255, 255, 0.08);
    border-color: rgba(255, 255, 255, 0.18);
  }
}

.titlebarSearchIcon {
  font-size: 12px;
  opacity: 0.4;
  flex-shrink: 0;
}

.titlebarSearchText {
  flex: 1;
  opacity: 0.35;
  text-align: center;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;

  &.hasUri {
    opacity: 0.7;
  }
}

.titlebarSearchKbd {
  font-size: 10px;
  padding: 1px 4px;
  border-radius: 3px;
  background: rgba(255, 255, 255, 0.08);
  opacity: 0.4;
  font-family: inherit;
  border: none;
  flex-shrink: 0;
}

.titlebarControls {
  display: flex;
  height: 100%;
  flex: 1;
  justify-content: flex-end;
}

.titlebarBtn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 46px;
  height: 100%;
  border: none;
  background: transparent;
  color: var(--nd-fg);
  opacity: 0.6;
  cursor: pointer;
  transition: background var(--nd-duration-fast), opacity var(--nd-duration-fast);

  &:hover {
    opacity: 1;
    background: var(--nd-buttonHoverBg);
  }
}

.titlebarBtnActive {
  opacity: 0.85;
}

.titlebarBtnClose {
  &:hover {
    background: #e81123;
    color: #fff;
    opacity: 1;
  }
}

.titlebarWindowBtn {}

// ── Hamburger menu ──
.menuBackdrop {
  position: fixed;
  inset: 0;
  z-index: var(--nd-z-popup);
  background: transparent;
}

.menuEnter {
  animation: menuFadeIn var(--nd-duration-base) var(--nd-ease-decel);
}

.menuLeave {
  animation: menuFadeOut var(--nd-duration-base) ease-out forwards;
}

@keyframes menuFadeIn {
  from { opacity: 0; }
}

@keyframes menuFadeOut {
  to { opacity: 0; }
}

.menuPanel {
  position: fixed;
  top: 32px;
  left: 0;
  min-width: 160px;
  box-shadow: var(--nd-shadow-m);
  font-size: 14px;
  z-index: calc(var(--nd-z-popup) + 1);
  background: color-mix(in srgb, var(--nd-navBg) 50%, var(--nd-deckBg, #1a1a1a));

  button {
    font-size: inherit;
  }
}

.menuItemActive {
  background: var(--nd-buttonHoverBg);
}

.menuCategoryItem {
  position: relative;
}

.menuChevron {
  margin-left: auto;
  font-size: 0.8em;
  opacity: 0.4;
}

.menuSub {
  position: absolute;
  left: 100%;
  top: 0;
  min-width: 180px;
  border-radius: 0;
  box-shadow: var(--nd-shadow-m);
  font-size: 14px;
  background: color-mix(in srgb, var(--nd-navBg) 50%, var(--nd-deckBg, #1a1a1a));
}

.menuKbd {
  margin-left: auto;
  font-size: 0.8em;
  opacity: 0.4;
  font-family: inherit;
}

</style>
