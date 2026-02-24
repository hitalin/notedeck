<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import { getCurrentWindow } from '@tauri-apps/api/window'

const appWindow = getCurrentWindow()
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
    <div class="titlebar-title" data-tauri-drag-region>notedeck</div>
    <div class="titlebar-controls">
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

.titlebar-title {
  padding-left: 12px;
  font-size: 0.75em;
  font-weight: bold;
  color: var(--nd-fg);
  opacity: 0.6;
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

.titlebar-btn-close:hover {
  background: #e81123;
  color: #fff;
  opacity: 1;
}
</style>
