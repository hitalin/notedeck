<script setup lang="ts">
import { getCurrentWindow } from '@tauri-apps/api/window'
import { onMounted, onUnmounted, ref } from 'vue'
import { useCommandStore } from '@/commands/registry'
import { useDeckStore } from '@/stores/deck'

const appWindow = getCurrentWindow()
const commandStore = useCommandStore()
const deckStore = useDeckStore()
const isMaximized = ref(false)

async function syncMaximized() {
  isMaximized.value = await appWindow.isMaximized()
}

let unlisten: (() => void) | null = null

onMounted(async () => {
  await syncMaximized()
  unlisten = await appWindow.onResized(syncMaximized)
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
</script>

<template>
  <div class="titlebar" data-tauri-drag-region>
    <div class="titlebar-left">
      <img src="/favicon.svg" alt="" class="titlebar-icon" draggable="false" />
    </div>
    <button class="titlebar-search-bar" @click="commandStore.toggle()">
      <i class="ti ti-search titlebar-search-icon" />
      <span class="titlebar-search-text" :class="{ 'has-uri': deckStore.activeColumnUri }">{{ deckStore.activeColumnUri ?? 'Search commands...' }}</span>
      <kbd class="titlebar-search-kbd">Ctrl+K</kbd>
    </button>
    <div class="titlebar-controls">
      <button
        class="titlebar-btn"
        :class="{ 'titlebar-btn-active': !deckStore.navCollapsed }"
        title="Toggle Sidebar"
        @click="commandStore.execute('toggle-sidebar')"
      >
        <i class="ti ti-layout-sidebar" />
      </button>
      <button class="titlebar-btn" title="Minimize" @click="minimize">
        <svg width="10" height="10" viewBox="0 0 10 10">
          <rect x="0" y="4.5" width="10" height="1" fill="currentColor" />
        </svg>
      </button>
      <button class="titlebar-btn" title="Maximize" @click="toggleMaximize">
        <svg v-if="!isMaximized" width="10" height="10" viewBox="0 0 10 10">
          <rect x="0.5" y="0.5" width="9" height="9" rx="1" stroke="currentColor" stroke-width="1" fill="none" />
        </svg>
        <svg v-else width="10" height="10" viewBox="0 0 10 10">
          <rect x="2.5" y="0.5" width="7" height="7" rx="1" stroke="currentColor" stroke-width="1" fill="none" />
          <rect x="0.5" y="2.5" width="7" height="7" rx="1" stroke="currentColor" stroke-width="1" fill="var(--nd-navBg, #1a1a2e)" />
        </svg>
      </button>
      <button class="titlebar-btn titlebar-btn-close" title="Close" @click="close">
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
  justify-content: space-between;
  height: 32px;
  background: var(--nd-navBg);
  user-select: none;
  flex-shrink: 0;
}

.titlebar-left {
  display: flex;
  align-items: center;
  height: 100%;
  flex-shrink: 0;
}

.titlebar-icon {
  width: 18px;
  height: 18px;
  margin-left: 10px;
  border-radius: 4px;
}

.titlebar-search-bar {
  display: flex;
  align-items: center;
  gap: 6px;
  flex: 1;
  max-width: 360px;
  height: 22px;
  margin: 0 12px;
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
</style>
