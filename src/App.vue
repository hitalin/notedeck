<script setup lang="ts">
import { computed, defineAsyncComponent, onMounted, onUnmounted } from 'vue'
import { useRoute } from 'vue-router'
import { useCommandStore } from '@/commands/registry'
import TitleBarComponent from '@/components/common/TitleBar.vue'
import { useKeyboard } from '@/composables/useKeyboard'
import { listenPipEvents } from '@/composables/usePipWindow'
import { useTheme } from '@/composables/useTheme'
import { useUiStore } from '@/stores/ui'
import { useWindowsStore } from '@/stores/windows'

const uiStore = useUiStore()
const { isTauri, isDesktop } = uiStore
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
  // Fallback: remove after 300ms if transitionend never fires (CSP may block inline transition)
  setTimeout(() => splash.remove(), 300)
}

onMounted(async () => {
  // Set platform attributes on html element for CSS targeting (independent of viewport width)
  const { platformName } = uiStore
  if (platformName) {
    document.documentElement.dataset.platform = platformName
  }
  document.documentElement.dataset.env = isTauri ? 'tauri' : 'web'

  // Show window (visible: false in tauri.conf.json to avoid Windows titlebar flicker)
  // NOTE: setDecorations(false) は呼ばない。config で既に false であり、
  // Windows で再度呼ぶとウィンドウスタイル再計算で非クライアント領域が復活する。
  if (isTauri) {
    const { getCurrentWindow } = await import('@tauri-apps/api/window')
    const currentWindow = getCurrentWindow()
    await currentWindow.show().catch(() => {})
  }

  // Dismiss splash screen as soon as Vue app is mounted
  dismissSplash()

  // Defer theme account fetching (network I/O) to after first paint
  useTheme()

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
  <div :class="$style.root">
    <template v-if="isTauri">
      <TitleBar v-if="isDesktop && !isPipWindow" />
      <div :class="$style.content">
        <router-view />
      </div>
    </template>
    <div v-else :class="$style.noTauri">
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

<style lang="scss" module>
.root {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
}

.content {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.noTauri {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  color: var(--nd-fg);
  font-size: 0.9em;
  gap: 4px;

  code {
    background: #333;
    padding: 2px 6px;
    border-radius: 4px;
    color: #ddd;
  }
}
</style>
