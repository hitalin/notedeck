<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from 'vue'
import { provideWindowEditAction } from '@/composables/useWindowEditAction'
import { provideWindowExternalFile } from '@/composables/useWindowExternalFile'
import { provideWindowExternalLink } from '@/composables/useWindowExternalLink'
import { useIsCompactLayout } from '@/stores/ui'
import {
  type DeckWindow,
  useWindowsStore,
  WINDOW_SIZES,
} from '@/stores/windows'
import { isTauri, openSettingsFileInEditor } from '@/utils/settingsFs'

const props = defineProps<{
  window: DeckWindow
  themeVars?: Record<string, string>
}>()

const emit = defineEmits<{ close: [] }>()

const windowsStore = useWindowsStore()
const isCompact = useIsCompactLayout()
const size = computed(() => WINDOW_SIZES[props.window.type])

// ヘッダー右側「外部エディタで開く」ボタン — 中身のコンポーネントが登録する
const externalFile = provideWindowExternalFile()
async function openExternalFile() {
  const t = externalFile.value
  if (!t || t.disabled) return
  try {
    await openSettingsFileInEditor(t.name, t.subdir)
  } catch (e) {
    console.warn('[DeckWindow] openExternalFile failed:', e)
  }
}

// ヘッダー右側「外部ブラウザで開く」ボタン
const externalLink = provideWindowExternalLink()
async function openExternalLink() {
  const t = externalLink.value
  if (!t || t.disabled) return
  try {
    const { openUrl } = await import('@tauri-apps/plugin-opener')
    await openUrl(t.url)
  } catch (e) {
    console.warn('[DeckWindow] openExternalLink failed:', e)
  }
}

// ヘッダー右側「編集」ボタン — 中身のコンポーネントが登録する
const editAction = provideWindowEditAction()
function runEditAction() {
  const t = editAction.value
  if (!t || t.disabled) return
  try {
    t.onClick()
  } catch (e) {
    console.warn('[DeckWindow] editAction failed:', e)
  }
}

const BASE_TITLES: Record<string, string> = {
  'note-detail': 'ノート',
  'note-inspector': 'ノートインスペクタ',
  'notification-inspector': '通知インスペクタ',
  'user-profile': 'プロフィール',
  'federation-instance': 'サーバー',
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
  'account-manager': 'アカウント管理',
  appearanceEditor: 'アピアランス',
  backup: 'バックアップ',
  tasksEditor: 'タスク設定',
  snippetsEditor: 'スニペット',
  memoEditor: 'メモ',
  'page-detail': 'ページ',
  'play-detail': 'Play',
  'gallery-detail': 'ギャラリー',
  'page-edit': 'ページを編集',
  'play-edit': 'Play を編集',
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
  'note-inspector': 'ti ti-code',
  'notification-inspector': 'ti ti-code',
  'user-profile': 'ti ti-user',
  'federation-instance': 'ti ti-planet',
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
  'account-manager': 'ti ti-users-group',
  appearanceEditor: 'ti ti-brush',
  backup: 'ti ti-package-export',
  tasksEditor: 'ti ti-player-play',
  snippetsEditor: 'ti ti-code-plus',
  memoEditor: 'ti ti-notes',
  'page-detail': 'ti ti-note',
  'play-detail': 'ti ti-player-play',
  'gallery-detail': 'ti ti-icons',
  'page-edit': 'ti ti-pencil',
  'play-edit': 'ti ti-pencil',
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

function onHeaderPointerDown(e: PointerEvent) {
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
  document.addEventListener('pointermove', onPointerMove)
  document.addEventListener('pointerup', onPointerUp)
  document.addEventListener('pointercancel', onPointerUp)
  windowsStore.bringToFront(props.window.id)
}

function onPointerMove(e: PointerEvent) {
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

function onPointerUp() {
  windowsStore.updatePosition(props.window.id, dragX.value, dragY.value)
  isDragging.value = false
  document.body.style.userSelect = ''
  document.removeEventListener('pointermove', onPointerMove)
  document.removeEventListener('pointerup', onPointerUp)
  document.removeEventListener('pointercancel', onPointerUp)
}

function onWindowMouseDown() {
  windowsStore.bringToFront(props.window.id)
}

onBeforeUnmount(() => {
  if (isDragging.value) onPointerUp()
})
</script>

<template>
  <div
    :class="[$style.deckWindow, { [$style.dragging]: isDragging, [$style.minimized]: isMinimized, [$style.maximized]: isMaximized, [$style.mobile]: isCompact }]"
    :style="isMaximized ? { ...themeVars, zIndex: window.zIndex } : {
      ...themeVars,
      '--nd-win-x': (isDragging ? dragX : window.x) + 'px',
      '--nd-win-y': (isDragging ? dragY : window.y) + 'px',
      '--nd-win-w': size.width + 'px',
      '--nd-win-h': size.maxHeight + 'px',
      zIndex: window.zIndex,
    }"
    @mousedown="onWindowMouseDown"
  >
    <div :class="$style.windowHeader" @pointerdown="onHeaderPointerDown">
      <i :class="[icons[window.type], $style.windowIcon]" />
      <span :class="$style.windowTitle">{{ windowTitle }}</span>
      <button
        v-if="editAction"
        class="_button"
        :class="$style.windowBtn"
        :disabled="editAction.disabled"
        :title="editAction.title ?? '編集'"
        @click="runEditAction"
      >
        <i :class="`ti ti-${editAction.icon ?? 'pencil'}`" />
      </button>
      <button
        v-if="isTauri && externalLink"
        class="_button"
        :class="$style.windowBtn"
        :disabled="externalLink.disabled"
        :title="externalLink.title ?? 'Web で開く'"
        @click="openExternalLink"
      >
        <i :class="`ti ti-${externalLink.icon ?? 'world'}`" />
      </button>
      <button
        v-if="isTauri && externalFile"
        class="_button"
        :class="$style.windowBtn"
        :disabled="externalFile.disabled"
        :title="`OS の既定エディタで ${externalFile.name} を開く`"
        @click="openExternalFile"
      >
        <i class="ti ti-external-link" />
      </button>
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
  left: 0;
  top: 0;
  translate: var(--nd-win-x, 0) var(--nd-win-y, 0);
  width: var(--nd-win-w, auto);
  max-height: var(--nd-win-h, none);
  display: flex;
  flex-direction: column;
  background: var(--nd-panel);
  border-radius: var(--nd-radius);
  box-shadow: 0 8px 32px var(--nd-shadow);
  overflow: clip;
  contain: layout paint;
  animation: windowIn 0.2s var(--nd-ease-spring);
}

@keyframes windowIn {
  from { opacity: 0; transform: scale(0.88) translateY(6px); }
}

.dragging {
  opacity: 0.92;
  will-change: translate;
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
    background var(--nd-duration-fast),
    opacity var(--nd-duration-fast);

  &:hover:not(:disabled) {
    background: var(--nd-buttonHoverBg);
    opacity: 1;
  }

  &:disabled {
    opacity: 0.3;
    cursor: not-allowed;
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
  translate: none !important;
  border-radius: 0;
  z-index: calc(var(--nd-z-navbar) + 1) !important;

  .windowBtn {
    width: 44px;
    height: 44px;
  }
}
</style>
