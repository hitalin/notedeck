<script setup lang="ts">
import { computed, defineAsyncComponent, onMounted, onUnmounted } from 'vue'
import { useRoute } from 'vue-router'
import { useCommandStore } from '@/commands/registry'
import { useKeyboard } from '@/composables/useKeyboard'
import { listenPipEvents } from '@/composables/usePipWindow'
import { useTheme } from '@/composables/useTheme'
import { useIsCompactLayout, useUiStore } from '@/stores/ui'
import { useWindowsStore } from '@/stores/windows'

const uiStore = useUiStore()
const { isTauri, isDesktop } = uiStore
const isCompact = useIsCompactLayout()
const route = useRoute()
const isPipWindow = computed(() => route.meta.pip === true)

const TitleBar = isTauri
  ? defineAsyncComponent(() => import('@/components/common/TitleBar.vue'))
  : null

const CommandPalette = defineAsyncComponent(
  () => import('@/components/common/CommandPalette.vue'),
)
const DeckWindowLayer = defineAsyncComponent(
  () => import('@/components/deck/DeckWindowLayer.vue'),
)

const commandStore = useCommandStore()

if (isTauri) {
  const { init: initKeyboard } = useKeyboard()
  initKeyboard()
}

// Listen for PiP IPC events (main window only)
let cleanupPipListener: (() => void) | null = null

function dismissSplash() {
  document.getElementById('nd-splash')?.remove()
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
    const [{ getCurrentWindow }, { catchIgnore }] = await Promise.all([
      import('@tauri-apps/api/window'),
      import('@/utils/logger'),
    ])
    // Wait for first frame paint before showing window to avoid white flash
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
    await getCurrentWindow().show().catch(catchIgnore('window.show'))
  }

  // Dismiss splash when first column renders content, with 2s timeout fallback
  const splashTimeout = setTimeout(dismissSplash, 2000)
  window.addEventListener(
    'nd:column-ready',
    () => {
      clearTimeout(splashTimeout)
      dismissSplash()
    },
    { once: true },
  )

  // Defer theme account fetching (network I/O) to after first paint
  useTheme()

  if (isTauri) {
    // Set up PiP event listener in main window
    if (!isPipWindow.value) {
      const windowsStore = useWindowsStore()
      const { useDeckStore } = await import('@/stores/deck')
      const deckStore = useDeckStore()
      cleanupPipListener = await listenPipEvents({
        onOpenNote: async (accountId, noteId) => {
          windowsStore.open('note-detail', { accountId, noteId })
          const { getCurrentWindow } = await import('@tauri-apps/api/window')
          await getCurrentWindow().setFocus()
        },
        onReturnToDeck: async (columnConfig) => {
          deckStore.addColumn(columnConfig)
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
      <TitleBar v-if="(isDesktop || !isCompact) && !isPipWindow" />
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
        <CommandPalette v-if="commandStore.isOpen && !isDesktop && isCompact" />
      </Teleport>
    </template>
  </div>
</template>

<style lang="scss" module>
.root {
  display: flex;
  flex-direction: column;
  height: 100dvh;
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
