<script setup lang="ts">
import { json } from '@codemirror/lang-json'
import JSON5 from 'json5'
import { computed, defineAsyncComponent, ref, watch } from 'vue'
import { useClipboardFeedback } from '@/composables/useClipboardFeedback'
import { useEditorTabs } from '@/composables/useEditorTabs'
import { getAccountAvatarUrl, useAccountsStore } from '@/stores/accounts'
import type { DeckColumn } from '@/stores/deck'
import { useDeckStore } from '@/stores/deck'
import { useDeckProfileStore } from '@/stores/deckProfile'
import { useServersStore } from '@/stores/servers'
import { createJson5Linter } from '@/utils/json5Linter'

const CodeEditor = defineAsyncComponent(
  () => import('@/components/deck/widgets/CodeEditor.vue'),
)

const COLUMN_TYPE_LABELS: Record<string, string> = {
  timeline: 'タイムライン',
  notifications: '通知',
  search: '検索',
  list: 'リスト',
  antenna: 'アンテナ',
  favorites: 'お気に入り',
  clip: 'クリップ',
  user: 'ユーザー',
  mentions: 'メンション',
  channel: 'チャンネル',
  specified: 'ダイレクト',
  chat: 'チャット',
  widget: 'ウィジェット',
  aiscript: 'AiScript',
  play: 'Play',
  page: 'ページ',
  ai: 'AI',
  announcements: 'お知らせ',
  drive: 'ドライブ',
  gallery: 'ギャラリー',
  explore: '探索',
  followRequests: 'フォローリクエスト',
  achievements: '実績',
  apiConsole: 'APIコンソール',
  apiDocs: 'APIドキュメント',
  lookup: '照会',
  serverInfo: 'サーバー情報',
  ads: '広告',
  aboutMisskey: 'Misskeyについて',
  emoji: '絵文字',
}

const COLUMN_TYPE_ICONS: Record<string, string> = {
  timeline: 'ti-list',
  notifications: 'ti-bell',
  search: 'ti-search',
  list: 'ti-list-check',
  antenna: 'ti-antenna',
  favorites: 'ti-star',
  clip: 'ti-paperclip',
  user: 'ti-user',
  mentions: 'ti-at',
  channel: 'ti-device-tv',
  specified: 'ti-mail',
  chat: 'ti-messages',
  widget: 'ti-apps',
  aiscript: 'ti-code',
  play: 'ti-player-play',
  page: 'ti-file-text',
  ai: 'ti-sparkles',
  announcements: 'ti-speakerphone',
  drive: 'ti-cloud',
  gallery: 'ti-photo',
  explore: 'ti-compass',
  followRequests: 'ti-user-plus',
  achievements: 'ti-trophy',
  apiConsole: 'ti-terminal',
  apiDocs: 'ti-book',
  lookup: 'ti-world-search',
  serverInfo: 'ti-server',
  ads: 'ti-ad',
  aboutMisskey: 'ti-info-circle',
  emoji: 'ti-mood-smile',
}

defineProps<{
  profileId?: string
}>()

const jsonLang = json()
const jsonLinter = createJson5Linter()

const accountsStore = useAccountsStore()
const serversStore = useServersStore()
const deckStore = useDeckStore()
const profileStore = useDeckProfileStore()

const codeContent = ref('')
const codeError = ref<string | null>(null)

const { tab, containerRef: editorRef } = useEditorTabs(
  ['visual', 'code'] as const,
  'visual',
)

function columnLabel(col: DeckColumn): string {
  if (col.name) return col.name
  const typeLabel = COLUMN_TYPE_LABELS[col.type] ?? col.type
  if (col.tl) return `${typeLabel} (${col.tl})`
  return typeLabel
}

const TL_ICONS: Record<string, string> = {
  home: 'ti-home',
  local: 'ti-planet',
  social: 'ti-rocket',
  global: 'ti-whirl',
}

function columnIcon(col: DeckColumn): string {
  if (col.type === 'timeline' && col.tl) {
    return `ti ${TL_ICONS[col.tl] ?? COLUMN_TYPE_ICONS.timeline ?? 'ti-layout-columns'}`
  }
  return `ti ${COLUMN_TYPE_ICONS[col.type] ?? 'ti-layout-columns'}`
}

function columnAvatarUrl(col: DeckColumn): string | null {
  if (!col.accountId) return null
  const account = accountsStore.accounts.find((a) => a.id === col.accountId)
  return account ? getAccountAvatarUrl(account) : null
}

function columnServerIconUrl(col: DeckColumn): string | null {
  if (!col.accountId) return null
  const account = accountsStore.accounts.find((a) => a.id === col.accountId)
  if (!account) return null
  const server = serversStore.servers.get(account.host)
  return server?.iconUrl ?? `https://${account.host}/favicon.ico`
}

// --- Group helpers (1 group = 1 button) ---

function groupPrimaryColumn(group: string[]): DeckColumn | null {
  for (const id of group) {
    const col = deckStore.getColumn(id)
    if (col) return col
  }
  return null
}

function groupLabel(group: string[]): string {
  const labels = group
    .map((id) => deckStore.getColumn(id))
    .filter((col): col is DeckColumn => col != null)
    .map((col) => columnLabel(col))
  return labels.join(' / ')
}

function groupAvatarUrl(group: string[]): string | null {
  const col = groupPrimaryColumn(group)
  return col ? columnAvatarUrl(col) : null
}

function groupServerIconUrl(group: string[]): string | null {
  const col = groupPrimaryColumn(group)
  return col ? columnServerIconUrl(col) : null
}

// --- Drag and drop (reorder layout groups, pointer-based like DeckColumnsArea) ---

const dragFromIndex = ref<number | null>(null)
const dragOverIndex = ref<number | null>(null)

function startDrag(groupIdx: number, e: PointerEvent) {
  if (e.button !== 0) return
  const target = e.target as HTMLElement
  if (target.closest('button')) return

  e.preventDefault()
  const sx = e.clientX

  function onMove(ev: PointerEvent) {
    if (Math.abs(ev.clientX - sx) < 5) return
    document.removeEventListener('pointermove', onMove)
    document.removeEventListener('pointerup', onCancel)
    beginDrag(groupIdx, ev)
  }

  function onCancel() {
    document.removeEventListener('pointermove', onMove)
    document.removeEventListener('pointerup', onCancel)
  }

  document.addEventListener('pointermove', onMove)
  document.addEventListener('pointerup', onCancel)
}

function beginDrag(groupIdx: number, _e: PointerEvent) {
  dragFromIndex.value = groupIdx
  document.body.style.userSelect = 'none'
  document.body.style.cursor = 'grabbing'
  document.addEventListener('pointermove', onDragMove)
  document.addEventListener('pointerup', onDragEnd)
}

function onDragMove(e: PointerEvent) {
  const el = document.elementFromPoint(e.clientX, e.clientY)
  if (!el) {
    dragOverIndex.value = null
    return
  }
  const card = el.closest('[data-group-idx]') as HTMLElement | null
  if (card) {
    const idx = Number(card.dataset.groupIdx)
    dragOverIndex.value = idx !== dragFromIndex.value ? idx : null
  } else {
    dragOverIndex.value = null
  }
}

function onDragEnd() {
  document.removeEventListener('pointermove', onDragMove)
  document.removeEventListener('pointerup', onDragEnd)
  document.body.style.userSelect = ''
  document.body.style.cursor = ''

  const fromIdx = dragFromIndex.value
  const toIdx = dragOverIndex.value
  dragFromIndex.value = null
  dragOverIndex.value = null

  if (fromIdx == null || toIdx == null || fromIdx === toIdx) return

  // Convert windowLayout indices to layout indices
  const wl = deckStore.windowLayout
  const fromGroup = wl[fromIdx]
  const toGroup = wl[toIdx]
  if (!fromGroup || !toGroup) return

  const fullLayout = deckStore.layout
  const fromLayoutIdx = fullLayout.indexOf(fromGroup)
  const toLayoutIdx = fullLayout.indexOf(toGroup)
  if (fromLayoutIdx < 0 || toLayoutIdx < 0) return

  // Move in full layout
  const newLayout = fullLayout.map((g) => [...g])
  const [moved] = newLayout.splice(fromLayoutIdx, 1)
  if (moved) {
    newLayout.splice(toLayoutIdx, 0, moved)
    deckStore.applyLayout(newLayout)
    deckStore.flushSave()
  }
}

function removeGroup(groupIdx: number) {
  const group = deckStore.windowLayout[groupIdx]
  if (!group) return
  for (const colId of group) {
    deckStore.removeColumn(colId)
  }
}

// --- Profile name editing ---

function onProfileNameChange(event: Event) {
  const input = event.target as HTMLInputElement
  const newName = input.value.trim()
  if (!newName || !profileStore.windowProfileId) return
  profileStore.renameProfile(profileStore.windowProfileId, newName)
}

// --- Code tab ---

function syncCodeFromVisual() {
  const data = {
    name: profileStore.currentProfileName,
    columns: deckStore.columns,
    layout: deckStore.windowLayout,
  }
  codeContent.value = JSON5.stringify(data, null, 2)
  codeError.value = null
}

function syncVisualFromCode() {
  try {
    const parsed = JSON5.parse(codeContent.value)
    if (!parsed || typeof parsed !== 'object') {
      codeError.value = '有効なJSONオブジェクトではありません'
      return
    }
    applyParsedProfile(parsed as Record<string, unknown>)
    codeError.value = null
  } catch (e) {
    codeError.value = e instanceof Error ? e.message : 'JSON5パースエラー'
  }
}

watch(tab, (newTab) => {
  if (newTab === 'code') syncCodeFromVisual()
})

// Import/Export
const {
  copied: copiedMessage,
  imported: importedMessage,
  importError,
  showCopied,
  showImported,
  showImportError,
} = useClipboardFeedback()

function applyParsedProfile(parsed: Record<string, unknown>) {
  if (parsed.name && profileStore.windowProfileId) {
    profileStore.renameProfile(
      profileStore.windowProfileId,
      parsed.name as string,
    )
  }
  const newColumns = Array.isArray(parsed.columns) ? parsed.columns : undefined
  const newLayout = Array.isArray(parsed.layout) ? parsed.layout : undefined
  if (newColumns && newLayout) {
    profileStore.setColumnsAndLayout(newColumns, newLayout)
  } else if (newColumns) {
    profileStore.setColumns(newColumns)
  } else if (newLayout) {
    profileStore.setLayout(newLayout)
  }
  profileStore.flushPersist()
}

function exportToClipboard() {
  const data = {
    name: profileStore.currentProfileName,
    columns: deckStore.columns,
    layout: deckStore.windowLayout,
  }
  navigator.clipboard.writeText(JSON5.stringify(data, null, 2))
  showCopied()
}

async function importFromClipboard() {
  try {
    const text = await navigator.clipboard.readText()
    const parsed = JSON5.parse(text)
    if (!parsed || typeof parsed !== 'object') {
      showImportError()
      return
    }
    applyParsedProfile(parsed as Record<string, unknown>)
    codeError.value = null
    showImported()
  } catch {
    showImportError()
  }
}
</script>

<template>
  <div ref="editorRef" :class="$style.editor">
    <!-- Tabs -->
    <div :class="$style.tabs">
      <button
        class="_button"
        :class="[$style.tab, { [$style.active]: tab === 'visual' }]"
        @click="tab = 'visual'"
      >
        <i class="ti ti-layout-columns" />
        ビジュアル
      </button>
      <button
        class="_button"
        :class="[$style.tab, { [$style.active]: tab === 'code' }]"
        @click="tab = 'code'"
      >
        <i class="ti ti-code" />
        コード
      </button>
    </div>

    <!-- Visual Editor -->
    <div v-if="tab === 'visual'" :class="$style.visualPanel">
      <!-- Profile name -->
      <div :class="$style.nameSection">
        <div :class="$style.nameLabel">
          <i class="ti ti-tag" />
          プロファイル名
        </div>
        <input
          :value="profileStore.currentProfileName ?? ''"
          :class="$style.nameInput"
          type="text"
          placeholder="プロファイル名"
          spellcheck="false"
          @change="onProfileNameChange"
        />
      </div>

      <!-- Column preview -->
      <div :class="$style.columnSection">
        <div :class="$style.sectionLabel">
          <i class="ti ti-columns" />
          カラム
          <span :class="$style.sectionBadge">{{ deckStore.windowLayout.length }}</span>
        </div>

        <div :class="$style.columnPreview">
          <div
            v-for="(group, groupIdx) in deckStore.windowLayout"
            :key="`${groupIdx}:${group.join(',')}`"
            :data-group-idx="groupIdx"
            :class="[
              $style.columnTab,
              { [$style.dragging]: dragFromIndex === groupIdx },
              { [$style.dragOver]: dragOverIndex === groupIdx },
            ]"
            :title="groupLabel(group)"
            @pointerdown="startDrag(groupIdx, $event)"
          >
            <i v-if="groupPrimaryColumn(group)" :class="'ti ' + columnIcon(groupPrimaryColumn(group)!)" />
            <span v-if="group.length > 1" :class="$style.stackBadge">{{ group.length }}</span>
            <span v-if="groupServerIconUrl(group)" :class="$style.serverBadge">
              <img :src="groupServerIconUrl(group)!" :class="$style.badgeImg" />
            </span>
            <span v-if="groupAvatarUrl(group)" :class="$style.accountBadge">
              <img :src="groupAvatarUrl(group)!" :class="$style.badgeImg" />
            </span>
            <button
              class="_button"
              :class="$style.removeBtn"
              @click.stop="removeGroup(groupIdx)"
            >
              <i class="ti ti-x" />
            </button>
          </div>

          <div v-if="deckStore.windowLayout.length === 0" :class="$style.emptyMessage">
            カラムがありません
          </div>
        </div>
      </div>
    </div>

    <!-- Code Editor -->
    <div v-if="tab === 'code'" :class="$style.codePanel">
      <CodeEditor
        v-model="codeContent"
        :language="jsonLang"
        :linter="jsonLinter"
      />
      <div v-if="codeError" :class="$style.codeError">
        {{ codeError }}
      </div>
      <button
        class="_button"
        :class="$style.codeApplyBtn"
        @click="syncVisualFromCode"
      >
        <i class="ti ti-refresh" />
        ビジュアルに同期
      </button>
    </div>

    <!-- Actions -->
    <div :class="$style.actions">
      <div :class="$style.actionGroup">
        <button
          class="_button"
          :class="[$style.actionBtn, $style.secondary, { [$style.feedback]: importedMessage || importError }]"
          @click="importFromClipboard"
        >
          <i class="ti" :class="importError ? 'ti-alert-circle' : 'ti-clipboard-text'" />
          {{ importError ? '無効' : importedMessage ? '読込済み' : 'インポート' }}
        </button>
        <button
          class="_button"
          :class="[$style.actionBtn, $style.secondary, { [$style.feedback]: copiedMessage }]"
          @click="exportToClipboard"
        >
          <i class="ti ti-clipboard-copy" />
          {{ copiedMessage ? 'コピー済み' : 'エクスポート' }}
        </button>
      </div>
    </div>
  </div>
</template>

<style module lang="scss">
@use '@/styles/buttons' as *;

.editor {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
  overflow: hidden;
}

.tabs {
  display: flex;
  gap: 0;
  border-bottom: 1px solid var(--nd-divider);
  flex-shrink: 0;
}

.tab {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 6px 12px;
  font-size: 0.75em;
  font-weight: bold;
  color: var(--nd-fg);
  opacity: 0.5;
  border-bottom: 2px solid transparent;
  transition: opacity var(--nd-duration-base), border-color var(--nd-duration-base);

  &:hover {
    opacity: 0.8;
  }

  &.active {
    opacity: 1;
    border-bottom-color: var(--nd-accent);
    color: var(--nd-accent);
  }
}

.visualPanel {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
  overflow-y: auto;
}

// --- Profile name section ---

.nameSection {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px 10px;
  border-bottom: 1px solid var(--nd-divider);
}

.nameLabel {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 0.8em;
  font-weight: bold;
  opacity: 0.7;
}

.nameInput {
  padding: 6px 10px;
  border: 1px solid var(--nd-divider);
  border-radius: var(--nd-radius-sm);
  background: var(--nd-bg);
  color: var(--nd-fg);
  font-size: 0.85em;
  font-weight: bold;
  outline: none;
  transition: border-color var(--nd-duration-base);

  &:focus {
    border-color: var(--nd-accent);
  }
}

// --- Column section ---

.columnSection {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px 10px;
}

.sectionLabel {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 0.8em;
  font-weight: bold;
  opacity: 0.7;
}

.sectionBadge {
  margin-left: auto;
  font-weight: normal;
  font-size: 0.9em;
  opacity: 0.8;
  min-width: 18px;
  text-align: center;
}

// --- Column preview (minimap — mirrors DeckColumnsArea) ---

.columnPreview {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 4px;
  padding: 8px 4px;
  background: var(--nd-panel);
  border-radius: var(--nd-radius-sm);
}

// Mirrors .tab in DeckBottomBar
.columnTab {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 42px;
  height: 42px;
  font-size: 16px;
  color: var(--nd-fg);
  opacity: 0.6;
  border-radius: var(--nd-radius-sm);
  cursor: grab;
  user-select: none;
  transition: opacity var(--nd-duration-base), background var(--nd-duration-base);

  &:hover {
    opacity: 1;
    background: var(--nd-buttonHoverBg);
  }

  &.dragging {
    opacity: 0.3;
    cursor: grabbing;
  }

  &.dragOver {
    outline: 2px solid var(--nd-accent);
    outline-offset: 1px;
  }
}

.stackBadge {
  position: absolute;
  top: 2px;
  left: 2px;
  min-width: 14px;
  height: 14px;
  padding: 0 3px;
  border-radius: 7px;
  background: var(--nd-accent);
  color: var(--nd-bg);
  font-size: 9px;
  font-weight: bold;
  line-height: 14px;
  text-align: center;
}

.removeBtn {
  position: absolute;
  top: -4px;
  right: -4px;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: var(--nd-error, #ec4137);
  color: #fff;
  font-size: 9px;
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1;
  opacity: 0;
  transition: opacity var(--nd-duration-fast);

  .columnTab:hover & {
    opacity: 1;
  }

  &:hover {
    filter: brightness(0.85);
  }
}

// Mirrors badge styles in DeckBottomBar
.serverBadge,
.accountBadge {
  position: absolute;
  width: 14px;
  height: 14px;
  border-radius: 50%;
  overflow: hidden;
  border: 1.5px solid var(--nd-panel);
  background: var(--nd-panel);
  display: flex;
  align-items: center;
  justify-content: center;
}

.serverBadge {
  top: 2px;
  right: 2px;
}

.accountBadge {
  bottom: 2px;
  left: 2px;
}

.badgeImg {
  width: 100%;
  height: 100%;
  object-fit: cover;
  border-radius: 50%;
}

.emptyMessage {
  padding: 24px 16px;
  text-align: center;
  font-size: 13px;
  color: var(--nd-fg);
  opacity: 0.3;
  width: 100%;
}

// --- Code panel ---

.codePanel {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.codeError {
  padding: 8px 12px;
  font-size: 12px;
  color: var(--nd-error);
  background: color-mix(in srgb, var(--nd-error) 10%, transparent);
}

.codeApplyBtn { @include btn-secondary; }

.actions { @include action-bar; }
.actionGroup { @include action-group; }

.actionBtn {
  &.secondary { @include btn-action; }
}

.secondary { /* modifier */ }
.feedback { /* modifier */ }
</style>
