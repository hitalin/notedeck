<script setup lang="ts">
import { getCurrentWindow, LogicalSize } from '@tauri-apps/api/window'
import {
  computed,
  defineAsyncComponent,
  onMounted,
  onUnmounted,
  ref,
} from 'vue'
import { useCommandStore } from '@/commands/registry'
import { openDeckWindow } from '@/composables/useDeckWindow'
import {
  closePipWindow,
  isPipOpen,
  openPipWindow,
} from '@/composables/usePipWindow'
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
const { platformName } = useUiStore()
const isCompact = useIsCompactLayout()

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

function openNewWindow() {
  const profile = deckStore.createEmptyProfile()
  openDeckWindow(profile.id)
}

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
  <div :class="[$style.titlebar, { [$style.mobile]: isCompact }]" data-tauri-drag-region>
    <div :class="$style.titlebarLeft" data-tauri-drag-region>
      <img src="/favicon.svg" alt="" :class="$style.titlebarIcon" draggable="false" data-tauri-drag-region />
    </div>
    <div :class="$style.titlebarCenter" data-tauri-drag-region>
      <!-- Open: inline command palette -->
      <CommandPalette v-if="commandStore.isOpen" inline />
      <!-- Closed: search bar button -->
      <button v-else :class="$style.titlebarSearchBar" @click="commandStore.openWithInput('>')">
        <i :class="[$style.titlebarSearchIcon, 'ti', 'ti-search']" />
        <span :class="[$style.titlebarSearchText, { [$style.hasUri]: deckStore.activeColumnUri }]">{{ titleBarText }}</span>
        <kbd :class="$style.titlebarSearchKbd">Ctrl+K</kbd>
      </button>
    </div>
    <div :class="$style.titlebarControls">
      <button
        :class="[$style.titlebarBtn, $style.titlebarWindowBtn]"
        title="新しいウィンドウ"
        @click="openNewWindow"
      >
        <i class="ti ti-app-window" />
      </button>
      <button
        :class="[$style.titlebarBtn, $style.titlebarSidebarBtn, { [$style.titlebarBtnActive]: !deckStore.navCollapsed }]"
        title="サイドバー切替"
        @click="commandStore.execute('toggle-sidebar')"
      >
        <i class="ti ti-layout-sidebar" />
      </button>
      <button
        :class="[$style.titlebarBtn, $style.titlebarWindowBtn]"
        :title="isCompactSize ? 'デスクトップサイズ' : 'モバイルサイズ'"
        @click="toggleMobileSize"
      >
        <i :class="isCompactSize ? 'ti ti-device-desktop' : 'ti ti-device-mobile'" />
      </button>
      <button
        :class="[$style.titlebarBtn, $style.titlebarWindowBtn]"
        title="ピクチャーインピクチャー"
        @click="togglePip"
      >
        <i class="ti ti-picture-in-picture" />
      </button>
      <button
        :class="[$style.titlebarBtn, $style.titlebarWindowBtn]"
        title="開発者ツール"
        @click="commandStore.execute('devtools')"
      >
        <i class="ti ti-code" />
      </button>
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
    </div>
  </div>
</template>

<style lang="scss" module>
.titlebar {
  display: flex;
  align-items: center;
  height: 32px;
  background: var(--nd-navBg);
  user-select: none;
  flex-shrink: 0;
}

.titlebarLeft {
  display: flex;
  align-items: center;
  height: 100%;
  flex: 1;
}

.titlebarIcon {
  width: 18px;
  height: 18px;
  margin-left: 10px;
  border-radius: 4px;
}

.titlebarCenter {
  display: flex;
  min-width: 0;
  max-width: 600px;
  width: 600px;
  padding: 0 12px;
  position: relative;
  flex-shrink: 1;
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

.titlebarSidebarBtn {}
.titlebarWindowBtn {}

.mobile {
  .titlebarCenter {
    display: none;
  }
}
</style>
