<script setup lang="ts">
import { computed, ref } from 'vue'
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
const size = computed(() => WINDOW_SIZES[props.window.type])

const titles: Record<string, string> = {
  'note-detail': 'ノート',
  'user-profile': 'プロフィール',
  login: 'アカウント追加',
  search: '検索',
  notifications: '通知',
  plugins: 'プラグイン',
  keybinds: 'キーバインド',
  ai: 'AI アシスタント',
}

const icons: Record<string, string> = {
  'note-detail': 'ti ti-note',
  'user-profile': 'ti ti-user',
  login: 'ti ti-login-2',
  search: 'ti ti-search',
  notifications: 'ti ti-bell',
  plugins: 'ti ti-plug',
  keybinds: 'ti ti-keyboard',
  ai: 'ti ti-sparkles',
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
  dragX.value = Math.max(
    -size.value.width + 100,
    Math.min(dragStartWinX + dx, window.innerWidth - 100),
  )
  dragY.value = Math.max(
    0,
    Math.min(dragStartWinY + dy, window.innerHeight - 50),
  )
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
    class="deck-window"
    :class="{ dragging: isDragging, minimized: isMinimized, maximized: isMaximized }"
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
    <div class="window-header" @mousedown="onHeaderMouseDown">
      <i :class="icons[window.type]" class="window-icon" />
      <span class="window-title">{{ titles[window.type] ?? '' }}</span>
      <button class="_button window-btn" title="最小化" @click="windowsStore.toggleMinimize(window.id)">
        <i class="ti ti-minus" />
      </button>
      <button class="_button window-btn" title="最大化" @click="windowsStore.toggleMaximize(window.id)">
        <i :class="isMaximized ? 'ti ti-picture-in-picture' : 'ti ti-square'" />
      </button>
      <button class="_button window-btn window-close" title="閉じる" @click="emit('close')">
        <i class="ti ti-x" />
      </button>
    </div>
    <div class="window-body">
      <slot />
    </div>
  </div>
</template>

<style scoped>
.deck-window {
  position: fixed;
  display: flex;
  flex-direction: column;
  background: var(--nd-panel);
  border-radius: var(--nd-radius);
  box-shadow: 0 8px 32px var(--nd-shadow);
  overflow: clip;
}

.deck-window.dragging {
  opacity: 0.92;
}

.deck-window.maximized {
  inset: 0;
  width: 100% !important;
  max-height: 100% !important;
  border-radius: 0;
}

.deck-window.minimized .window-body {
  display: none;
}

.window-header {
  display: flex;
  align-items: center;
  gap: 8px;
  height: 42px;
  padding: 0 8px 0 16px;
  background: var(--nd-windowHeader);
  backdrop-filter: blur(15px);
  border-bottom: 1px solid var(--nd-divider);
  cursor: grab;
  flex-shrink: 0;
  user-select: none;
}

.deck-window.dragging .window-header {
  cursor: grabbing;
}

.window-icon {
  font-size: 1em;
  opacity: 0.6;
  flex-shrink: 0;
}

.window-title {
  flex: 1;
  font-weight: bold;
  font-size: 0.9em;
  color: var(--nd-fgHighlighted);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.window-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border-radius: 6px;
  color: var(--nd-fg);
  opacity: 0.6;
  flex-shrink: 0;
  transition:
    background 0.15s,
    opacity 0.15s;
}

.window-btn:hover {
  background: var(--nd-buttonHoverBg);
  opacity: 1;
}

.window-close:hover {
  color: var(--nd-love);
}

.window-body {
  flex: 1;
  min-height: 0;
  overflow: auto;
}

@media (max-width: 500px) {
  .deck-window {
    left: 0 !important;
    top: 0 !important;
    right: 0 !important;
    bottom: 0 !important;
    width: 100% !important;
    height: 100% !important;
    max-height: 100% !important;
    border-radius: 0;
    z-index: 2100 !important;
  }

  .window-header {
    min-height: 46px;
    padding-top: var(--nd-safe-area-top, env(safe-area-inset-top));
  }

  .window-btn {
    width: 44px;
    height: 44px;
  }
}
</style>
