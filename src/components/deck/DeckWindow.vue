<script setup lang="ts">
import { computed, ref } from 'vue'
import { useIsCompactLayout } from '@/stores/ui'
import {
  type DeckWindow,
  useWindowsStore,
  WINDOW_SIZES,
} from '@/stores/windows'

const props = defineProps<{
  window: DeckWindow
  themeVars?: Record<string, string>
}>()

const emit = defineEmits<{ close: [] }>()

const windowsStore = useWindowsStore()
const isCompact = useIsCompactLayout()
const size = computed(() => WINDOW_SIZES[props.window.type])

const BASE_TITLES: Record<string, string> = {
  'note-detail': 'ノート',
  'user-profile': 'プロフィール',
  'follow-list': 'フォロー / フォロワー',
  login: 'アカウント追加',
  search: '検索',
  notifications: '通知',
  plugins: 'プラグイン',
  keybinds: 'キーバインド',
  cssEditor: 'カスタムCSS',
  themeEditor: 'テーマ',
  profileEditor: 'プロファイルエディタ',
  ai: 'AI アシスタント',
  aiSettings: 'AI 設定',
  chat: 'チャット',
  about: 'NoteDeck について',
  navEditor: 'ナビバー',
  performanceEditor: 'パフォーマンス',
}

const windowTitle = computed(() => {
  const base = BASE_TITLES[props.window.type] ?? ''
  if (props.window.type === 'follow-list' && props.window.props.username) {
    return `@${props.window.props.username} のフォロー / フォロワー`
  }
  return base
})

const icons: Record<string, string> = {
  'note-detail': 'ti ti-note',
  'user-profile': 'ti ti-user',
  'follow-list': 'ti ti-users',
  login: 'ti ti-login-2',
  search: 'ti ti-search',
  notifications: 'ti ti-bell',
  plugins: 'ti ti-plug',
  keybinds: 'ti ti-keyboard',
  cssEditor: 'ti ti-code',
  themeEditor: 'ti ti-palette',
  profileEditor: 'ti ti-layout-columns',
  ai: 'ti ti-sparkles',
  aiSettings: 'ti ti-robot',
  chat: 'ti ti-messages',
  about: 'ti ti-info-circle',
  navEditor: 'ti ti-layout-sidebar-left-collapse',
  performanceEditor: 'ti ti-gauge',
}

const isMinimized = computed(() => props.window.minimized)
const isMaximized = computed(() => props.window.maximized)

const isDragging = ref(false)
const dragX = ref(0)
const dragY = ref(0)
let dragStartX = 0
let dragStartY = 0
let dragStartWinX = 0
let dragStartWinY = 0

function onHeaderMouseDown(e: MouseEvent) {
  if ((e.target as HTMLElement).closest('button')) return
  e.preventDefault()
  isDragging.value = true
  dragStartX = e.clientX
  dragStartY = e.clientY
  dragStartWinX = props.window.x
  dragStartWinY = props.window.y
  dragX.value = props.window.x
  dragY.value = props.window.y
  document.body.style.userSelect = 'none'
  document.addEventListener('mousemove', onMouseMove)
  document.addEventListener('mouseup', onMouseUp)
  windowsStore.bringToFront(props.window.id)
}

function onMouseMove(e: MouseEvent) {
  const dx = e.clientX - dragStartX
  const dy = e.clientY - dragStartY
  const vw = document.documentElement.clientWidth
  const vh = document.documentElement.clientHeight
  dragX.value = Math.max(
    -size.value.width + 100,
    Math.min(dragStartWinX + dx, vw - 100),
  )
  dragY.value = Math.max(0, Math.min(dragStartWinY + dy, vh - 50))
}

function onMouseUp() {
  windowsStore.updatePosition(props.window.id, dragX.value, dragY.value)
  isDragging.value = false
  document.body.style.userSelect = ''
  document.removeEventListener('mousemove', onMouseMove)
  document.removeEventListener('mouseup', onMouseUp)
}

function onWindowMouseDown() {
  windowsStore.bringToFront(props.window.id)
}
</script>

<template>
  <div
    :class="[$style.deckWindow, { [$style.dragging]: isDragging, [$style.minimized]: isMinimized, [$style.maximized]: isMaximized, [$style.mobile]: isCompact }]"
    :style="isMaximized ? { ...themeVars, zIndex: window.zIndex } : {
      ...themeVars,
      left: (isDragging ? dragX : window.x) + 'px',
      top: (isDragging ? dragY : window.y) + 'px',
      width: size.width + 'px',
      maxHeight: size.maxHeight + 'px',
      zIndex: window.zIndex,
    }"
    @mousedown="onWindowMouseDown"
  >
    <div :class="$style.windowHeader" @mousedown="onHeaderMouseDown">
      <i :class="[icons[window.type], $style.windowIcon]" />
      <span :class="$style.windowTitle">{{ windowTitle }}</span>
      <button class="_button" :class="$style.windowBtn" title="最小化" @click="windowsStore.toggleMinimize(window.id)">
        <i class="ti ti-minus" />
      </button>
      <button class="_button" :class="$style.windowBtn" title="最大化" @click="windowsStore.toggleMaximize(window.id)">
        <i :class="isMaximized ? 'ti ti-picture-in-picture' : 'ti ti-square'" />
      </button>
      <button class="_button" :class="[$style.windowBtn, $style.windowClose]" title="閉じる" @click="emit('close')">
        <i class="ti ti-x" />
      </button>
    </div>
    <div :class="$style.windowBody">
      <slot />
    </div>
  </div>
</template>

<style lang="scss" module>
.deckWindow {
  position: fixed;
  display: flex;
  flex-direction: column;
  background: var(--nd-panel);
  border-radius: var(--nd-radius);
  box-shadow: 0 8px 32px var(--nd-shadow);
  overflow: clip;
  animation: windowIn 0.38s var(--nd-ease-spring);
}

@keyframes windowIn {
  from { opacity: 0; transform: scale(0.88) translateY(6px); }
}

@media (prefers-reduced-motion: reduce) {
  .deckWindow { animation: none; }
}

.dragging {
  opacity: 0.92;
}

.maximized {
  top: var(--nd-app-inset-top, 0px);
  left: 0;
  right: 0;
  bottom: 0;
  width: 100% !important;
  max-height: none !important;
  border-radius: 0;
}

.minimized {
  .windowBody {
    display: none;
  }
}

.windowHeader {
  display: flex;
  align-items: center;
  gap: 8px;
  height: 42px;
  padding: 0 8px 0 16px;
  background: var(--nd-windowHeader);
  backdrop-filter: var(--nd-vibrancy);
  -webkit-backdrop-filter: var(--nd-vibrancy);
  border-bottom: 1px solid var(--nd-divider);
  cursor: grab;
  flex-shrink: 0;
  user-select: none;

  .dragging & {
    cursor: grabbing;
  }
}

.windowIcon {
  font-size: 1em;
  opacity: 0.6;
  flex-shrink: 0;
}

.windowTitle {
  flex: 1;
  font-weight: bold;
  font-size: 0.9em;
  color: var(--nd-fgHighlighted);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.windowBtn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border-radius: var(--nd-radius-sm);
  color: var(--nd-fg);
  opacity: 0.6;
  flex-shrink: 0;
  transition:
    background 0.15s,
    opacity 0.15s;

  &:hover {
    background: var(--nd-buttonHoverBg);
    opacity: 1;
  }
}

.windowClose {
  &:hover {
    color: var(--nd-love);
  }
}

.windowBody {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.mobile {
  left: 0 !important;
  top: var(--nd-app-inset-top, 0px) !important;
  right: 0 !important;
  bottom: 0 !important;
  width: 100% !important;
  height: auto !important;
  max-height: none !important;
  border-radius: 0;
  z-index: calc(var(--nd-z-navbar) + 1) !important;

  .windowBtn {
    width: 44px;
    height: 44px;
  }
}
</style>
