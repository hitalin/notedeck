<script setup lang="ts">
import { openUrl } from '@tauri-apps/plugin-opener'
import { computed } from 'vue'
import {
  popOutColumnToWindow,
  requestMoveColumn,
} from '@/composables/useDeckWindow'
import { useDeckStore } from '@/stores/deck'
import { useUiStore } from '@/stores/ui'

const props = defineProps<{
  columnId: string
  title: string
  color?: string
  themeVars?: Record<string, string>
  soundEnabled?: boolean
  webUiUrl?: string
}>()

const emit = defineEmits<{ 'header-click': [] }>()

const deckStore = useDeckStore()
const { isDesktop } = useUiStore()

/** Whether this column can be popped out (desktop + main window only) */
const canPopOut = computed(() => isDesktop && !deckStore.currentWindowId)
/** Whether this column is in a sub-window and can be returned to main */
const canRecall = computed(() => isDesktop && !!deckStore.currentWindowId)

function close() {
  deckStore.removeColumn(props.columnId)
}

function popOut() {
  popOutColumnToWindow(props.columnId)
}

function recallToMain() {
  requestMoveColumn(props.columnId, null)
}

const isMuted = computed(
  () => deckStore.getColumn(props.columnId)?.soundMuted ?? false,
)

function toggleMute() {
  deckStore.updateColumn(props.columnId, { soundMuted: !isMuted.value })
}
</script>

<template>
  <section
    class="deck-column"
    :style="themeVars"
  >
    <header
      class="column-header"
      @click="emit('header-click')"
    >
      <!-- Color indicator bar (Misskey style) -->
      <div
        class="color-indicator"
        :style="{ background: color || 'var(--nd-accent)' }"
      />

      <slot name="header-icon" />
      <span class="header-title">{{ title }}</span>

      <!-- Grabber (Misskey 6-dot pattern) -->
      <i class="ti ti-grip-vertical grabber" />

      <slot name="header-meta" />

      <!-- Open in Web UI -->
      <button v-if="webUiUrl" class="_button header-btn" title="Web UIで開く" @click.stop="openUrl(webUiUrl)">
        <i class="ti ti-external-link" />
      </button>

      <!-- Pop out to separate window -->
      <button v-if="canPopOut" class="_button header-btn" title="別ウィンドウで開く" @click.stop="popOut">
        <i class="ti ti-app-window" />
      </button>

      <!-- Return to main window -->
      <button v-if="canRecall" class="_button header-btn" title="メインウィンドウに戻す" @click.stop="recallToMain">
        <i class="ti ti-arrow-back-up" />
      </button>

      <!-- Sound mute toggle -->
      <button v-if="soundEnabled" class="_button header-btn" :title="isMuted ? 'ミュート解除' : 'ミュート'" @click.stop="toggleMute">
        <i :class="isMuted ? 'ti ti-volume-off' : 'ti ti-volume'" />
      </button>

      <!-- Remove column button -->
      <button class="_button header-btn" title="カラムを削除" @click.stop="close">
        <i class="ti ti-x" />
      </button>
    </header>

    <div class="column-sub-header">
      <slot name="header-extra" />
    </div>

    <div class="column-body">
      <slot />
    </div>

  </section>
</template>

<style scoped>
.deck-column {
  width: 100%;
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  background: var(--nd-panel);
  color: var(--nd-fg);
  border-radius: 10px;
  overflow: clip;
  contain: layout paint style;
  container-type: inline-size;
  position: relative;
}

.column-header {
  position: relative;
  display: flex;
  align-items: center;
  gap: 6px;
  height: 38px;
  line-height: 38px;
  padding: 0 8px 0 30px;
  background: var(--nd-panelHeaderBg);
  color: var(--nd-panelHeaderFg);
  font-size: 0.9em;
  font-weight: bold;
  flex-shrink: 0;
  cursor: grab;
  user-select: none;
  z-index: 2;
  overflow: visible;
  box-shadow: 0 0.5px 0 0 rgba(255, 255, 255, 0.07);
}

.column-header:active {
  cursor: grabbing;
}

.color-indicator {
  position: absolute;
  top: 12px;
  left: 12px;
  width: 5px;
  height: calc(100% - 24px);
  border-radius: 999px;
}

.header-title {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 0.85em;
}

.grabber {
  flex-shrink: 0;
  opacity: 0.35;
  cursor: grab;
  margin-left: auto;
}

.grabber:hover {
  opacity: 0.6;
}

.header-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border-radius: 6px;
  flex-shrink: 0;
  opacity: 0.35;
}

.header-btn:hover {
  background: var(--nd-buttonHoverBg);
  opacity: 0.8;
}

.column-sub-header {
  flex-shrink: 0;
}

.column-body {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background-color: var(--nd-bg);
}

@media (max-width: 500px) {
  .deck-column {
    border-radius: 0;
  }

  .column-header {
    height: 50px;
    line-height: 50px;
    padding: 0 12px 0 28px;
  }

  .color-indicator {
    top: 16px;
    height: calc(100% - 32px);
  }

  .header-btn {
    width: 36px;
    height: 36px;
  }
}
</style>
