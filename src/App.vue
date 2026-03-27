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

const splashShownAt = performance.now()

function dismissSplash() {
  const el = document.getElementById('nd-splash')
  if (!el) return
  // Ensure splash is visible for at least 150ms to avoid a flash-like flicker.
  // If the deck layout mounts very quickly, a tiny flash feels glitchy.
  const elapsed = performance.now() - splashShownAt
  const delay = Math.max(0, 150 - elapsed)
  setTimeout(() => {
    el.classList.add('nd-splash-leaving')
    el.addEventListener('transitionend', () => el.remove(), { once: true })
    setTimeout(() => el.remove(), 300)
  }, delay)
}

onMounted(async () => {
  // Set platform attributes on html element for CSS targeting (independent of viewport width)
  const { platformName } = uiStore
  if (platformName) {
    document.documentElement.dataset.platform = platformName
  }
  document.documentElement.dataset.env = isTauri ? 'tauri' : 'web'

  // Show window immediately (visible: false in tauri.conf.json to avoid WebView2 flash).
  // Splash screen covers FOUT, so no need to wait for fonts.
  // NOTE: setDecorations(false) は呼ばない。config で既に false であり、
  // Windows で再度呼ぶとウィンドウスタイル再計算で非クライアント領域が復活する。
  if (isTauri) {
    const [{ getCurrentWindow }, { catchIgnore }] = await Promise.all([
      import('@tauri-apps/api/window'),
      import('@/utils/logger'),
    ])
    await getCurrentWindow().show().catch(catchIgnore('window.show'))
  }

  // Dismiss splash when deck layout structure is mounted (not data load).
  // This shows column frames immediately; notes fill in asynchronously.
  const splashTimeout = setTimeout(dismissSplash, 500)
  window.addEventListener(
    'nd:deck-mounted',
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
