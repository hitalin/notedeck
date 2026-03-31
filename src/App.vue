<script setup lang="ts">
import {
  computed,
  defineAsyncComponent,
  onMounted,
  onUnmounted,
  watch,
} from 'vue'
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

const DevWelcome = isTauri
  ? null
  : defineAsyncComponent(() => import('@/components/DevWelcome.vue'))

const TitleBar = isTauri
  ? defineAsyncComponent(() => import('@/components/common/TitleBar.vue'))
  : null

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
  const elapsed = performance.now() - splashShownAt
  const delay = Math.max(0, 150 - elapsed)
  setTimeout(() => {
    // Start #app entrance animation in sync with splash fade-out
    document.getElementById('app')?.classList.add('nd-app-ready')
    el.classList.add('nd-splash-leaving')
    el.addEventListener('transitionend', () => el.remove(), { once: true })
    setTimeout(() => el.remove(), 400)
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
  const stopWatchMounted = watch(
    () => uiStore.deckMounted,
    (mounted) => {
      if (mounted) {
        clearTimeout(splashTimeout)
        dismissSplash()
        stopWatchMounted()
      }
    },
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
    <DevWelcome v-else />

    <template v-if="!isPipWindow">
      <DeckWindowLayer />
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

</style>
