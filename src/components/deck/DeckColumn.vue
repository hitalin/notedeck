<script setup lang="ts">
import { openUrl } from '@tauri-apps/plugin-opener'
import { computed, onBeforeUnmount, ref } from 'vue'
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
const hasWallpaper = computed(() => deckStore.wallpaper != null)

const showMenu = ref(false)
const menuBtnEl = ref<HTMLElement | null>(null)
const menuEl = ref<HTMLElement | null>(null)

function toggleMenu() {
  showMenu.value = !showMenu.value
  if (showMenu.value) {
    requestAnimationFrame(() => {
      document.addEventListener('pointerdown', onMenuOutsideClick)
    })
  } else {
    document.removeEventListener('pointerdown', onMenuOutsideClick)
  }
}

function closeMenu() {
  showMenu.value = false
  document.removeEventListener('pointerdown', onMenuOutsideClick)
}

function onMenuOutsideClick(e: PointerEvent) {
  const target = e.target as Node
  if (
    menuEl.value &&
    !menuEl.value.contains(target) &&
    menuBtnEl.value &&
    !menuBtnEl.value.contains(target)
  ) {
    closeMenu()
  }
}

onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', onMenuOutsideClick)
})

function close() {
  closeMenu()
  deckStore.removeColumn(props.columnId)
}

function popOut() {
  closeMenu()
  popOutColumnToWindow(props.columnId)
}

function recallToMain() {
  closeMenu()
  requestMoveColumn(props.columnId, null)
}

const isMuted = computed(
  () => deckStore.getColumn(props.columnId)?.soundMuted ?? false,
)

function toggleMute() {
  closeMenu()
  deckStore.updateColumn(props.columnId, { soundMuted: !isMuted.value })
}

function onOpenWebUi() {
  closeMenu()
  if (props.webUiUrl) openUrl(props.webUiUrl)
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
      @contextmenu.prevent.stop="toggleMenu"
    >
      <!-- Tab shape decoration (Misskey style, hidden with wallpaper) -->
      <svg v-if="!hasWallpaper" class="tab-shape" viewBox="0 0 256 128">
        <g transform="matrix(6.2431,0,0,6.2431,-677.417,-29.3839)">
          <path d="M149.512,4.707L108.507,4.707C116.252,4.719 118.758,14.958 118.758,14.958C118.758,14.958 121.381,25.283 129.009,25.209L149.512,25.209L149.512,4.707Z" style="fill:var(--nd-deckBg)" />
        </g>
      </svg>

      <!-- Color indicator bar (Misskey style) -->
      <div
        class="color-indicator"
        :style="{ background: color || 'var(--nd-accent)' }"
      />

      <slot name="header-icon" />
      <span class="header-title">{{ title }}</span>

      <slot name="header-meta" />

      <!-- Grabber (Misskey 6-dot pattern) -->
      <i class="ti ti-grip-vertical grabber" />

      <!-- Column menu button -->
      <button ref="menuBtnEl" class="_button header-btn" title="メニュー" @click.stop="toggleMenu">
        <i class="ti ti-dots" />
      </button>

      <!-- Column action menu -->
      <Transition name="col-menu">
        <div v-if="showMenu" ref="menuEl" class="column-menu" @pointerdown.stop>
          <button v-if="webUiUrl" class="_button column-menu-item" @click="onOpenWebUi">
            <i class="ti ti-external-link" />
            <span>Web UIで開く</span>
          </button>
          <button v-if="canPopOut" class="_button column-menu-item" @click="popOut">
            <i class="ti ti-app-window" />
            <span>別ウィンドウで開く</span>
          </button>
          <button v-if="canRecall" class="_button column-menu-item" @click="recallToMain">
            <i class="ti ti-arrow-back-up" />
            <span>メインウィンドウに戻す</span>
          </button>
          <button v-if="soundEnabled" class="_button column-menu-item" @click="toggleMute">
            <i :class="isMuted ? 'ti ti-volume' : 'ti ti-volume-off'" />
            <span>{{ isMuted ? 'ミュート解除' : 'ミュート' }}</span>
          </button>
          <div class="column-menu-divider" />
          <button class="_button column-menu-item column-menu-danger" @click="close">
            <i class="ti ti-trash" />
            <span>カラムを削除</span>
          </button>
        </div>
      </Transition>
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
  padding: 0 8px 0 28px;
  background: var(--nd-panelHeaderBg);
  color: var(--nd-panelHeaderFg);
  font-size: 0.9em;
  font-weight: bold;
  flex-shrink: 0;
  cursor: grab;
  user-select: none;
  z-index: 2;
  overflow: visible;
}

.column-header:active {
  cursor: grabbing;
}

.tab-shape {
  position: absolute;
  top: 0;
  right: -8px;
  width: auto;
  height: calc(100% - 6px);
  pointer-events: none;
}

.color-indicator {
  position: absolute;
  top: 10px;
  left: 10px;
  width: 3px;
  height: calc(100% - 20px);
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
  opacity: 0.5;
  cursor: grab;
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
  opacity: 0.5;
}

.header-btn:hover {
  background: var(--nd-buttonHoverBg);
  opacity: 0.8;
}

/* Column action menu */
.column-menu {
  position: absolute;
  top: 100%;
  right: 4px;
  margin-top: 4px;
  background: var(--nd-popup, var(--nd-panelBg));
  border-radius: 8px;
  box-shadow: var(--nd-shadow-m);
  backdrop-filter: blur(16px);
  padding: 8px 0;
  z-index: var(--nd-z-menu);
  min-width: 180px;
  max-width: 260px;
  cursor: default;
}

.column-menu-item {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 8px 16px;
  font-size: 0.9em;
  color: var(--nd-fg);
  cursor: pointer;
  position: relative;
  transition: background 0.1s;
}

.column-menu-item:hover {
  background: color-mix(in srgb, var(--nd-accent) 15%, transparent);
}

.column-menu-item i {
  flex-shrink: 0;
  width: 18px;
  text-align: center;
  opacity: 0.7;
}

.column-menu-item span {
  white-space: nowrap;
}

.column-menu-danger {
  color: var(--nd-love, #ff6b6b);
}

.column-menu-danger i {
  opacity: 1;
}

.column-menu-divider {
  border: 0;
  border-top: 0.5px solid var(--nd-divider);
  margin: 4px 0;
}

.col-menu-enter-active,
.col-menu-leave-active {
  transition: opacity 0.15s ease, transform 0.15s ease;
}

.col-menu-enter-from,
.col-menu-leave-to {
  opacity: 0;
  transform: translateY(-4px) scale(0.97);
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
    padding: 0 12px 0 32px;
  }

  .header-btn {
    width: 36px;
    height: 36px;
  }
}

/* Mobile platform (viewport may exceed 500px) */
html.nd-mobile .deck-column {
  border-radius: 0;
}

html.nd-mobile .column-header {
  height: 50px;
  line-height: 50px;
  padding: 0 12px 0 32px;
}

html.nd-mobile .header-btn {
  width: 36px;
  height: 36px;
}
</style>
