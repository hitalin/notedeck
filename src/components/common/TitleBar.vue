<script setup lang="ts">
import { getCurrentWindow, LogicalSize } from '@tauri-apps/api/window'
import { defineAsyncComponent, onBeforeUnmount, onMounted, onUnmounted, ref } from 'vue'
import { useCommandStore } from '@/commands/registry'
import { openDeckWindow } from '@/composables/useDeckWindow'
import {
  closePipWindow,
  isPipOpen,
  openPipWindow,
} from '@/composables/usePipWindow'
import { useAccountsStore } from '@/stores/accounts'
import type { DeckProfile } from '@/stores/deck'
import { useDeckStore } from '@/stores/deck'

const CommandPalette = defineAsyncComponent(
  () => import('@/components/common/CommandPalette.vue'),
)

const appWindow = getCurrentWindow()
const commandStore = useCommandStore()
const accountsStore = useAccountsStore()
const deckStore = useDeckStore()
const isMaximized = ref(false)
const isMobileSize = ref(false)

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
  isMobileSize.value = logicalWidth <= MOBILE_WIDTH + 20
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
  if (isMobileSize.value) {
    if (savedDesktopSize) {
      await appWindow.setSize(
        new LogicalSize(savedDesktopSize.width, savedDesktopSize.height),
      )
    } else {
      await appWindow.setSize(new LogicalSize(1200, 800))
    }
    savedDesktopSize = null
  } else {
    // Unmaximize first if maximized
    if (isMaximized.value) {
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

// --- New window profile picker ---
const showWindowPicker = ref(false)
const windowPickerProfiles = ref<DeckProfile[]>([])
const windowPickerEl = ref<HTMLElement | null>(null)

function toggleWindowPicker() {
  showWindowPicker.value = !showWindowPicker.value
  if (showWindowPicker.value) {
    windowPickerProfiles.value = deckStore.getProfiles()
  }
}

function handleWindowPickerOutside(e: PointerEvent) {
  if (
    windowPickerEl.value &&
    !windowPickerEl.value.contains(e.target as Node)
  ) {
    showWindowPicker.value = false
  }
}

function openWithProfile(profileId: string) {
  showWindowPicker.value = false
  openDeckWindow(profileId)
}

function openWithNewProfile() {
  showWindowPicker.value = false
  const profile = deckStore.createEmptyProfile()
  openDeckWindow(profile.id)
}

onMounted(() => {
  document.addEventListener('pointerdown', handleWindowPickerOutside)
})

onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', handleWindowPickerOutside)
})

async function togglePip() {
  if (await isPipOpen()) {
    await closePipWindow()
    return
  }
  const col = deckStore.activeColumnId
    ? deckStore.columns.find((c) => c.id === deckStore.activeColumnId)
    : null
  const accountId = col?.accountId ?? accountsStore.accounts[0]?.id
  const timeline = col?.tl ?? 'home'
  if (accountId) {
    await openPipWindow(accountId, timeline)
  }
}
</script>

<template>
  <div class="titlebar" data-tauri-drag-region>
    <div class="titlebar-left" data-tauri-drag-region>
      <img src="/favicon.svg" alt="" class="titlebar-icon" draggable="false" data-tauri-drag-region />
    </div>
    <div class="titlebar-center" data-tauri-drag-region>
      <!-- Open: inline command palette -->
      <CommandPalette v-if="commandStore.isOpen" inline />
      <!-- Closed: search bar button -->
      <button v-else class="titlebar-search-bar" @click="commandStore.toggle()">
        <i class="ti ti-search titlebar-search-icon" />
        <span class="titlebar-search-text" :class="{ 'has-uri': deckStore.activeColumnUri }">{{ deckStore.activeColumnUri ?? 'コマンドを検索...' }}</span>
        <kbd class="titlebar-search-kbd">Ctrl+K</kbd>
      </button>
    </div>
    <div class="titlebar-controls">
      <div class="titlebar-window-picker-wrap">
        <button
          class="titlebar-btn titlebar-window-btn"
          title="新しいウィンドウ"
          @click.stop="toggleWindowPicker()"
        >
          <i class="ti ti-app-window" />
        </button>
        <Transition name="window-picker">
          <div v-if="showWindowPicker" ref="windowPickerEl" class="window-picker" @pointerdown.stop>
            <div class="window-picker-title">プロファイルを選択</div>
            <div
              v-for="p in windowPickerProfiles"
              :key="p.id"
              class="window-picker-item"
              @click="openWithProfile(p.id)"
            >
              {{ p.name }}
            </div>
            <div class="window-picker-divider" />
            <div class="window-picker-item window-picker-new" @click="openWithNewProfile">
              <i class="ti ti-plus" />
              <span>新しいプロファイル</span>
            </div>
          </div>
        </Transition>
      </div>
      <button
        class="titlebar-btn titlebar-sidebar-btn"
        :class="{ 'titlebar-btn-active': !deckStore.navCollapsed }"
        title="サイドバー切替"
        @click="commandStore.execute('toggle-sidebar')"
      >
        <i class="ti ti-layout-sidebar" />
      </button>
      <button
        class="titlebar-btn titlebar-window-btn"
        :title="isMobileSize ? 'デスクトップサイズ' : 'モバイルサイズ'"
        @click="toggleMobileSize"
      >
        <i :class="isMobileSize ? 'ti ti-device-desktop' : 'ti ti-device-mobile'" />
      </button>
      <button
        class="titlebar-btn titlebar-window-btn"
        title="ピクチャーインピクチャー"
        @click="togglePip"
      >
        <i class="ti ti-picture-in-picture" />
      </button>
      <button class="titlebar-btn titlebar-window-btn" title="最小化" @click="minimize">
        <svg width="10" height="10" viewBox="0 0 10 10">
          <rect x="0" y="4.5" width="10" height="1" fill="currentColor" />
        </svg>
      </button>
      <button class="titlebar-btn titlebar-window-btn" title="最大化" @click="toggleMaximize">
        <svg v-if="!isMaximized" width="10" height="10" viewBox="0 0 10 10">
          <rect x="0.5" y="0.5" width="9" height="9" rx="1" stroke="currentColor" stroke-width="1" fill="none" />
        </svg>
        <svg v-else width="10" height="10" viewBox="0 0 10 10">
          <rect x="2.5" y="0.5" width="7" height="7" rx="1" stroke="currentColor" stroke-width="1" fill="none" />
          <rect x="0.5" y="2.5" width="7" height="7" rx="1" stroke="currentColor" stroke-width="1" fill="var(--nd-navBg, #1a1a2e)" />
        </svg>
      </button>
      <button class="titlebar-btn titlebar-btn-close" title="閉じる" @click="close">
        <svg width="10" height="10" viewBox="0 0 10 10">
          <path d="M1 1L9 9M9 1L1 9" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" />
        </svg>
      </button>
    </div>
  </div>
</template>

<style scoped>
.titlebar {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 32px;
  background: var(--nd-navBg);
  user-select: none;
  flex-shrink: 0;
  position: relative;
}

.titlebar-left {
  position: absolute;
  left: 0;
  display: flex;
  align-items: center;
  height: 100%;
}

.titlebar-icon {
  width: 18px;
  height: 18px;
  margin-left: 10px;
  border-radius: 4px;
}

.titlebar-center {
  display: flex;
  width: 100%;
  max-width: 600px;
  padding: 0 12px;
  position: relative;
}

.titlebar-search-bar {
  display: flex;
  align-items: center;
  gap: 6px;
  width: 100%;
  height: 22px;
  padding: 0 8px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 6px;
  background: rgba(255, 255, 255, 0.05);
  color: var(--nd-fg);
  cursor: pointer;
  font-family: inherit;
  font-size: 12px;
  transition:
    background 0.15s,
    border-color 0.15s;
}

.titlebar-search-bar:hover {
  background: rgba(255, 255, 255, 0.08);
  border-color: rgba(255, 255, 255, 0.18);
}

.titlebar-search-icon {
  font-size: 12px;
  opacity: 0.4;
  flex-shrink: 0;
}

.titlebar-search-text {
  flex: 1;
  opacity: 0.35;
  text-align: left;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.titlebar-search-text.has-uri {
  opacity: 0.7;
}

.titlebar-search-kbd {
  font-size: 10px;
  padding: 1px 4px;
  border-radius: 3px;
  background: rgba(255, 255, 255, 0.08);
  opacity: 0.4;
  font-family: inherit;
  border: none;
  flex-shrink: 0;
}

.titlebar-controls {
  position: absolute;
  right: 0;
  display: flex;
  height: 100%;
}

.titlebar-btn {
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
  transition: background 0.1s, opacity 0.1s;
}

.titlebar-btn:hover {
  opacity: 1;
  background: var(--nd-buttonHoverBg);
}

.titlebar-btn-active {
  opacity: 0.85;
}

.titlebar-btn-close:hover {
  background: #e81123;
  color: #fff;
  opacity: 1;
}

.titlebar-window-picker-wrap {
  position: relative;
  display: flex;
  height: 100%;
}

.window-picker {
  position: absolute;
  top: 100%;
  right: 0;
  margin-top: 4px;
  background: var(--nd-popup, var(--nd-panelBg));
  border-radius: 8px;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.15);
  backdrop-filter: blur(16px);
  padding: 8px 0;
  z-index: 100;
  min-width: 180px;
  max-width: 280px;
}

.window-picker-title {
  padding: 4px 16px 8px;
  font-size: 0.8em;
  opacity: 0.4;
  color: var(--nd-fg);
}

.window-picker-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 5px 16px;
  cursor: pointer;
  font-size: 0.9em;
  line-height: 20px;
  color: var(--nd-fg);
  position: relative;
}

.window-picker-item::before {
  content: '';
  display: block;
  position: absolute;
  inset: 2px 8px;
  border-radius: 6px;
  transition: background 0.1s;
}

.window-picker-item:hover::before {
  background: color-mix(in srgb, var(--nd-accent) 15%, transparent);
}

.window-picker-item > * {
  position: relative;
}

.window-picker-divider {
  border: 0;
  border-top: 0.5px solid var(--nd-divider);
  margin: 8px 0;
}

.window-picker-new {
  opacity: 0.7;
}

.window-picker-new:hover {
  opacity: 1;
}

.window-picker-enter-active,
.window-picker-leave-active {
  transition: opacity 0.15s, transform 0.15s;
}

.window-picker-enter-from,
.window-picker-leave-to {
  opacity: 0;
  transform: translateY(-4px);
}

@media (max-width: 500px) {
  .titlebar-sidebar-btn,
  .titlebar-window-btn {
    display: none;
  }
}
</style>
