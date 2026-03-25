<script setup lang="ts">
import { openUrl } from '@tauri-apps/plugin-opener'
import { computed, inject, onBeforeUnmount, ref } from 'vue'
import {
  popOutColumnToWindow,
  requestMoveColumn,
} from '@/composables/useDeckWindow'
import { useVaporTransition } from '@/composables/useVaporTransition'
import { useConfirm } from '@/stores/confirm'
import type { DeckColumn as DeckColumnType } from '@/stores/deck'
import { useDeckStore } from '@/stores/deck'
import { useIsCompactLayout, useUiStore } from '@/stores/ui'

const props = defineProps<{
  columnId: string
  title: string
  color?: string
  themeVars?: Record<string, string>
  soundEnabled?: boolean
  webUiUrl?: string
}>()

const isPipMode = window.location.pathname === '/pip'
const pipColumnConfig = inject<(() => DeckColumnType | null) | undefined>(
  'pipColumnConfig',
  undefined,
)

const emit = defineEmits<{ 'header-click': [] }>()

const { confirm } = useConfirm()
const deckStore = useDeckStore()
const { isDesktop } = useUiStore()
const isCompact = useIsCompactLayout()

/** Whether this column can be popped out (desktop + main window only) */
const canPopOut = computed(() => isDesktop && !deckStore.currentWindowId)
/** Whether this column is in a sub-window and can be returned to main */
const canRecall = computed(() => isDesktop && !!deckStore.currentWindowId)
const hasWallpaper = computed(() => deckStore.wallpaper != null)

const showMenu = ref(false)
const { visible: menuVisible, leaving: menuLeaving } = useVaporTransition(
  showMenu,
  { enterDuration: 180, leaveDuration: 180 },
)
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

async function close() {
  closeMenu()
  if (isPipMode) {
    const { getCurrentWindow } = await import('@tauri-apps/api/window')
    await getCurrentWindow().close()
    return
  }
  const ok = await confirm({
    title: 'カラムを削除',
    message: 'このカラムを削除しますか？',
    okLabel: '削除',
    type: 'danger',
  })
  if (ok) deckStore.removeColumn(props.columnId)
}

/** Return this PiP column back to the main deck window */
async function returnToDeck() {
  closeMenu()
  const config = pipColumnConfig?.()
  if (!config) return
  const { id: _, ...rest } = config
  const { emit } = await import('@tauri-apps/api/event')
  await emit('pip:return-to-deck', rest)
  const { getCurrentWindow } = await import('@tauri-apps/api/window')
  await getCurrentWindow().close()
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

/** Open this column as a PiP window, then remove from deck */
function openAsPip() {
  closeMenu()
  const col = deckStore.getColumn(props.columnId)
  if (!col) return
  const { id: _, ...config } = col
  import('@/composables/usePipWindow').then(({ openPipWindow }) => {
    openPipWindow(config)
    deckStore.removeColumn(props.columnId)
  })
}
</script>

<template>
  <section
    class="deck-column"
    :class="[$style.deckColumn, { [$style.mobile]: isCompact }]"
    :style="themeVars"
  >
    <header
      class="column-header"
      :class="$style.columnHeader"
      :data-tauri-drag-region="isPipMode ? '' : undefined"
      @click="emit('header-click')"
      @contextmenu.prevent.stop="!isPipMode && toggleMenu()"
    >
      <!-- Tab shape decoration (Misskey style, hidden with wallpaper / PiP) -->
      <svg v-if="!hasWallpaper && !isPipMode" :class="$style.tabShape" viewBox="0 0 256 128">
        <g transform="matrix(6.2431,0,0,6.2431,-677.417,-29.3839)">
          <path d="M149.512,4.707L108.507,4.707C116.252,4.719 118.758,14.958 118.758,14.958C118.758,14.958 121.381,25.283 129.009,25.209L149.512,25.209L149.512,4.707Z" style="fill:var(--nd-deckBg)" />
        </g>
      </svg>

      <!-- Color indicator bar (Misskey style) -->
      <div
        :class="$style.colorIndicator"
        :style="{ background: color || 'var(--nd-accent)' }"
        :data-tauri-drag-region="isPipMode ? '' : undefined"
      />

      <slot name="header-icon" />
      <span :class="$style.headerTitle" :data-tauri-drag-region="isPipMode ? '' : undefined">{{ title }}</span>

      <template v-if="!isPipMode">
        <slot name="header-meta" />
      </template>

      <!-- Grabber (Misskey 6-dot pattern, hidden in PiP) -->
      <i v-if="!isPipMode" :class="$style.grabber" class="ti ti-grip-vertical" />

      <!-- Menu button (shared between PiP and Deck) -->
      <button ref="menuBtnEl" :class="$style.headerBtn" class="_button" title="メニュー" @click.stop="toggleMenu">
        <i class="ti ti-dots" />
      </button>

      <!-- Column action menu -->
        <div v-if="menuVisible" ref="menuEl" :class="[$style.columnMenu, menuLeaving ? $style.menuLeave : $style.menuEnter]" class="_popupMenu" @pointerdown.stop>
          <!-- PiP menu -->
          <template v-if="isPipMode">
            <button :class="$style.columnMenuItem" class="_button" @click="returnToDeck">
              <i class="ti ti-arrow-back-up" />
              <span>デッキに戻す</span>
            </button>
            <div :class="$style.columnMenuDivider" />
            <button :class="[$style.columnMenuItem, $style.columnMenuDanger]" class="_button" @click="close">
              <i class="ti ti-x" />
              <span>閉じる</span>
            </button>
          </template>
          <!-- Deck menu -->
          <template v-else>
            <button v-if="webUiUrl" :class="$style.columnMenuItem" class="_button" @click="onOpenWebUi">
              <i class="ti ti-external-link" />
              <span>Web UIで開く</span>
            </button>
            <button v-if="canPopOut" :class="$style.columnMenuItem" class="_button" @click="popOut">
              <i class="ti ti-app-window" />
              <span>別ウィンドウで開く</span>
            </button>
            <button v-if="canPopOut" :class="$style.columnMenuItem" class="_button" @click="openAsPip">
              <i class="ti ti-picture-in-picture" />
              <span>PiPウィンドウとして開く</span>
            </button>
            <button v-if="canRecall" :class="$style.columnMenuItem" class="_button" @click="recallToMain">
              <i class="ti ti-arrow-back-up" />
              <span>メインウィンドウに戻す</span>
            </button>
            <button v-if="soundEnabled" :class="$style.columnMenuItem" class="_button" @click="toggleMute">
              <i :class="isMuted ? 'ti ti-volume' : 'ti ti-volume-off'" />
              <span>{{ isMuted ? 'ミュート解除' : 'ミュート' }}</span>
            </button>
            <div :class="$style.columnMenuDivider" />
            <button :class="[$style.columnMenuItem, $style.columnMenuDanger]" class="_button" @click="close">
              <i class="ti ti-trash" />
              <span>カラムを削除</span>
            </button>
          </template>
        </div>
    </header>

    <div :class="$style.columnSubHeader">
      <slot name="header-extra" />
    </div>

    <div :class="$style.columnBody">
      <slot />
    </div>

  </section>
</template>

<style lang="scss" module>
.deckColumn {
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

.columnHeader {
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

  &:active {
    cursor: grabbing;
  }
}

.tabShape {
  position: absolute;
  top: 0;
  right: -8px;
  width: auto;
  height: calc(100% - 6px);
  pointer-events: none;
}

.colorIndicator {
  position: absolute;
  top: 12px;
  left: 12px;
  width: 3px;
  height: calc(100% - 24px);
  border-radius: var(--nd-radius-full);
}

.headerTitle {
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

  &:hover {
    opacity: 0.6;
  }
}

.headerBtn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border-radius: var(--nd-radius-sm);
  flex-shrink: 0;
  opacity: 0.5;

  &:hover {
    background: var(--nd-buttonHoverBg);
    opacity: 0.8;
  }
}

/* Column action menu */
.columnMenu {
  top: 100%;
  right: 4px;
  margin-top: 4px;
  min-width: 180px;
  max-width: 260px;
  cursor: default;
  line-height: 1.35;
  font-weight: normal;
  font-size: 1rem;
}

.columnMenuItem {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 7px 22px;
  font-size: 0.85em;
  color: var(--nd-fg);
  cursor: pointer;
  position: relative;
  transition: background var(--nd-duration-fast);

  &:hover {
    background: var(--nd-accent-hover);
  }

  i {
    flex-shrink: 0;
    width: 1em;
    text-align: center;
    opacity: 0.8;
  }

  span {
    white-space: nowrap;
  }
}

.columnMenuDanger {
  color: var(--nd-love, #ff6b6b);

  i {
    opacity: 1;
  }
}

.columnMenuDivider {
  border: 0;
  border-top: 0.5px solid var(--nd-divider);
  margin: 4px 0;
}

.columnSubHeader {
  flex-shrink: 0;
}

.columnBody {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background-color: var(--nd-bg);
}

.mobile {
  border-radius: 0;

  .columnHeader {
    height: 40px;
    line-height: 40px;
    padding: 0 12px 0 32px;
  }
  .headerBtn {
    width: 36px;
    height: 36px;
  }
}

.menuEnter {
  animation: colMenuIn var(--nd-duration-base) ease;
}
.menuLeave {
  animation: colMenuOut var(--nd-duration-base) ease forwards;
}

@keyframes colMenuIn {
  from { opacity: 0; transform: translateY(-4px) scale(0.97); }
}
@keyframes colMenuOut {
  to { opacity: 0; transform: translateY(-4px) scale(0.97); }
}
</style>
