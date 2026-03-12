<script setup lang="ts">
import { computed, defineAsyncComponent, onMounted, onUnmounted } from 'vue'
import { useRoute } from 'vue-router'
import { useCommandStore } from '@/commands/registry'
import TitleBarComponent from '@/components/common/TitleBar.vue'
import { useKeyboard } from '@/composables/useKeyboard'
import { listenPipEvents } from '@/composables/usePipWindow'
import { useTheme } from '@/composables/useTheme'
import { useVibrancy } from '@/composables/useVibrancy'
import { useUiStore } from '@/stores/ui'
import { useWindowsStore } from '@/stores/windows'

const { isTauri, isDesktop } = useUiStore()
const route = useRoute()
const isPipWindow = computed(() => route.meta.pip === true)

const TitleBar = isDesktop ? TitleBarComponent : null

const CommandPalette = defineAsyncComponent(
  () => import('@/components/common/CommandPalette.vue'),
)
const DeckWindowLayer = defineAsyncComponent(
  () => import('@/components/deck/DeckWindowLayer.vue'),
)

const commandStore = useCommandStore()

const { init: initKeyboard } = useKeyboard()
initKeyboard()

// Listen for PiP IPC events (main window only)
let cleanupPipListener: (() => void) | null = null

function dismissSplash() {
  const splash = document.getElementById('nd-splash')
  if (!splash) return
  splash.style.opacity = '0'
  splash.addEventListener('transitionend', () => splash.remove(), {
    once: true,
  })
}

onMounted(async () => {
  // Fix Windows titlebar gap + show window
  if (isTauri) {
    const { invoke } = await import('@tauri-apps/api/core')
    await invoke('fix_window_frame').catch(() => {})
    const { getCurrentWindow } = await import('@tauri-apps/api/window')
    await getCurrentWindow()
      .show()
      .catch(() => {})
  }

  // Dismiss splash screen as soon as Vue app is mounted
  dismissSplash()

  // Defer theme account fetching (network I/O) to after first paint
  useTheme()

  // Restore window vibrancy if previously enabled
  const { init: initVibrancy } = useVibrancy()
  initVibrancy()

  if (isTauri) {
    // Set up PiP event listener in main window
    if (!isPipWindow.value) {
      const windowsStore = useWindowsStore()
      cleanupPipListener = await listenPipEvents({
        onOpenNote: async (accountId, noteId) => {
          windowsStore.open('note-detail', { accountId, noteId })
          const { getCurrentWindow } = await import('@tauri-apps/api/window')
          await getCurrentWindow().setFocus()
        },
      }).catch(() => null)
    }
  }
})

onUnmounted(() => {
  cleanupPipListener?.()
})
</script>

<template>
  <div class="app-root">
    <template v-if="isTauri">
      <TitleBar v-if="isDesktop && !isPipWindow" />
      <div class="app-content">
        <router-view />
      </div>
    </template>
    <div v-else class="no-tauri">
      <p>NoteDeck requires the Tauri runtime.</p>
      <p>Run <code>pnpm tauri:dev</code> instead of <code>pnpm dev</code>.</p>
    </div>

    <template v-if="!isPipWindow">
      <DeckWindowLayer />

      <Teleport to="body">
        <CommandPalette v-if="commandStore.isOpen && !isDesktop" />
      </Teleport>
    </template>
  </div>
</template>

<style scoped>
.app-root {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
}

.app-content {
  flex: 1;
  min-height: 0;
}

.no-tauri {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  color: var(--nd-fg);
  font-size: 0.9em;
  gap: 4px;
}

.no-tauri code {
  background: #333;
  padding: 2px 6px;
  border-radius: 4px;
  color: #ddd;
}
</style>
