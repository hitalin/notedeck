<script setup lang="ts">
import { json } from '@codemirror/lang-json'
import { type Diagnostic, linter } from '@codemirror/lint'
import JSON5 from 'json5'
import { defineAsyncComponent, ref, watch } from 'vue'
import { useSwipeTab } from '@/composables/useSwipeTab'
import { getAccountAvatarUrl, useAccountsStore } from '@/stores/accounts'
import type { DeckColumn } from '@/stores/deck'
import { useDeckStore } from '@/stores/deck'
import { useDeckProfileStore } from '@/stores/deckProfile'
import { useServersStore } from '@/stores/servers'

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

const jsonLinter = linter(
  (view) => {
    const diagnostics: Diagnostic[] = []
    const code = view.state.doc.toString()
    if (!code.trim()) return diagnostics
    try {
      JSON5.parse(code)
    } catch (e) {
      if (e instanceof Error) {
        const lineMatch = e.message.match(/at (\d+):(\d+)/)
        let from = 0
        let to = code.length
        if (lineMatch) {
          const lineNum = Number.parseInt(lineMatch[1] ?? '1', 10)
          const line = view.state.doc.line(
            Math.min(lineNum, view.state.doc.lines),
          )
          from = line.from
          to = line.to
        }
        diagnostics.push({ from, to, severity: 'error', message: e.message })
      }
    }
    return diagnostics
  },
  { delay: 500 },
)

const accountsStore = useAccountsStore()
const serversStore = useServersStore()
const deckStore = useDeckStore()
const profileStore = useDeckProfileStore()

const tab = ref<'visual' | 'code'>('visual')
const codeContent = ref('')
const codeError = ref<string | null>(null)
const editorRef = ref<HTMLElement | null>(null)

const TABS = ['visual', 'code'] as const
useSwipeTab(
  editorRef,
  () => {
    const idx = TABS.indexOf(tab.value)
    const next = TABS[idx + 1]
    if (next) {
      tab.value = next
      return true
    }
  },
  () => {
    const idx = TABS.indexOf(tab.value)
    const prev = TABS[idx - 1]
    if (prev) {
      tab.value = prev
      return true
    }
  },
)

function columnLabel(col: DeckColumn): string {
  if (col.name) return col.name
  const typeLabel = COLUMN_TYPE_LABELS[col.type] ?? col.type
  if (col.tl) return `${typeLabel} (${col.tl})`
  return typeLabel
}

function columnIcon(col: DeckColumn): string {
  return `ti ${COLUMN_TYPE_ICONS[col.type] ?? 'ti-layout-columns'}`
}

function columnAccount(col: DeckColumn): string {
  return col.account ?? col.accountId ?? ''
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

function removeColumn(id: string) {
  deckStore.removeColumn(id)
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
    if (parsed.name && profileStore.windowProfileId) {
      profileStore.renameProfile(profileStore.windowProfileId, parsed.name)
    }
    const newColumns = Array.isArray(parsed.columns)
      ? parsed.columns
      : undefined
    const newLayout = Array.isArray(parsed.layout) ? parsed.layout : undefined
    if (newColumns && newLayout) {
      profileStore.setColumnsAndLayout(newColumns, newLayout)
    } else if (newColumns) {
      profileStore.setColumns(newColumns)
    } else if (newLayout) {
      profileStore.setLayout(newLayout)
    }
    profileStore.flushPersist()
    codeError.value = null
  } catch (e) {
    codeError.value = e instanceof Error ? e.message : 'JSON5パースエラー'
  }
}

watch(tab, (newTab) => {
  if (newTab === 'code') syncCodeFromVisual()
})

// Import/Export
const copiedMessage = ref(false)
const importedMessage = ref(false)
const importError = ref(false)

function exportToClipboard() {
  const data = {
    name: profileStore.currentProfileName,
    columns: deckStore.columns,
    layout: deckStore.windowLayout,
  }
  navigator.clipboard.writeText(JSON5.stringify(data, null, 2))
  copiedMessage.value = true
  setTimeout(() => {
    copiedMessage.value = false
  }, 2000)
}

async function importFromClipboard() {
  try {
    const text = await navigator.clipboard.readText()
    const parsed = JSON5.parse(text)
    if (!parsed || typeof parsed !== 'object') {
      importError.value = true
      setTimeout(() => {
        importError.value = false
      }, 2000)
      return
    }
    if (parsed.name && profileStore.windowProfileId) {
      profileStore.renameProfile(profileStore.windowProfileId, parsed.name)
    }
    const newColumns = Array.isArray(parsed.columns)
      ? parsed.columns
      : undefined
    const newLayout = Array.isArray(parsed.layout) ? parsed.layout : undefined
    if (newColumns && newLayout) {
      profileStore.setColumnsAndLayout(newColumns, newLayout)
    } else if (newColumns) {
      profileStore.setColumns(newColumns)
    } else if (newLayout) {
      profileStore.setLayout(newLayout)
    }
    profileStore.flushPersist()
    codeError.value = null
    importedMessage.value = true
    setTimeout(() => {
      importedMessage.value = false
    }, 2000)
  } catch {
    importError.value = true
    setTimeout(() => {
      importError.value = false
    }, 2000)
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
            $style.columnCard,
            { [$style.dragging]: dragFromIndex === groupIdx },
            { [$style.dragOver]: dragOverIndex === groupIdx },
          ]"
          @pointerdown="startDrag(groupIdx, $event)"
        >
          <div
            v-for="colId in group"
            :key="colId"
            :class="$style.columnCell"
          >
            <template v-if="deckStore.getColumn(colId)">
              <div :class="$style.columnCellHeader" :title="columnLabel(deckStore.getColumn(colId)!)">
                <i :class="[columnIcon(deckStore.getColumn(colId)!), $style.columnCellIcon]" />
                <button
                  class="_button"
                  :class="$style.columnCellClose"
                  title="削除"
                  @click="removeColumn(colId)"
                >
                  <i class="ti ti-x" />
                </button>
              </div>
              <div :class="$style.columnCellBody">
                <img
                  v-if="columnAvatarUrl(deckStore.getColumn(colId)!)"
                  :src="columnAvatarUrl(deckStore.getColumn(colId)!) ?? undefined"
                  :class="$style.columnAvatar"
                />
                <img
                  v-if="columnServerIconUrl(deckStore.getColumn(colId)!)"
                  :src="columnServerIconUrl(deckStore.getColumn(colId)!) ?? undefined"
                  :class="$style.columnServerIcon"
                />
              </div>
            </template>
          </div>
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
  flex: 1;
  min-height: 0;
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

// --- Column preview (horizontal scroll) ---

.columnPreview {
  display: flex;
  justify-content: center;
  gap: 4px;
  overflow-x: auto;
  overflow-y: hidden;
  overscroll-behavior: contain;
  padding: 4px 0 8px;
  flex: 1;
  min-height: 100px;

  // Thin scrollbar
  &::-webkit-scrollbar {
    height: 4px;
  }
  &::-webkit-scrollbar-track {
    background: transparent;
  }
  &::-webkit-scrollbar-thumb {
    background: var(--nd-divider);
    border-radius: 2px;
  }
}

.columnCard {
  flex: 0 0 auto;
  width: 44px;
  display: flex;
  flex-direction: column;
  background: var(--nd-panel);
  border-radius: 10px;
  overflow: clip;
  cursor: grab;
  user-select: none;
  box-shadow: 0 0 0 1px var(--nd-divider);
  transition: opacity 0.15s, box-shadow 0.15s;

  &:hover {
    box-shadow: 0 0 0 1px color-mix(in srgb, var(--nd-accent) 50%, var(--nd-divider));
  }

  &.dragging {
    opacity: 0.3;
    cursor: grabbing;
  }

  &.dragOver {
    box-shadow: 0 0 0 2px var(--nd-accent);
  }
}

// --- Column cell (mimics DeckColumn) ---

.columnCell {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;

  & + .columnCell {
    border-top: 2px solid var(--nd-deckBg, var(--nd-bg));
  }
}

.columnCellHeader {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 2px;
  height: 26px;
  padding: 0 4px;
  background: var(--nd-panelHeaderBg);
  color: var(--nd-panelHeaderFg);
  flex-shrink: 0;
  position: relative;
}

.columnCellIcon {
  font-size: 20px;
  color: var(--nd-panelHeaderFg);
  opacity: 0.7;
}

.columnCellClose {
  position: absolute;
  right: 2px;
  font-size: 12px;
  color: var(--nd-panelHeaderFg);
  opacity: 0;
  padding: 2px;
  border-radius: var(--nd-radius-sm);
  transition: opacity 0.1s;

  .columnCard:hover & {
    opacity: 0.4;
  }

  &:hover {
    opacity: 1 !important;
    color: var(--nd-error);
    background: color-mix(in srgb, var(--nd-error) 10%, transparent);
  }
}

.columnCellBody {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 8px 4px;
  background: var(--nd-panel);
}

.columnAvatar {
  width: 24px;
  height: 24px;
  border-radius: 50%;
  object-fit: cover;
}

.columnServerIcon {
  width: 22px;
  height: 22px;
  border-radius: 4px;
  object-fit: contain;
  opacity: 0.5;
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

.codeApplyBtn {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 6px 12px;
  border-radius: var(--nd-radius-sm);
  background: var(--nd-buttonBg);
  color: var(--nd-fg);
  font-size: 0.8em;
  font-weight: bold;
  transition: background var(--nd-duration-base);

  &:hover {
    background: var(--nd-buttonHoverBg);
  }
}

.actions {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 10px;
  border-top: 1px solid var(--nd-divider);
  flex-shrink: 0;
}

.actionGroup {
  display: flex;
  gap: 6px;
}

.actionBtn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  padding: 8px 12px;
  border-radius: var(--nd-radius-sm);
  font-size: 0.8em;
  font-weight: bold;
  transition: background var(--nd-duration-base), color var(--nd-duration-base);

  &.secondary {
    flex: 1;
    background: var(--nd-buttonBg);
    color: var(--nd-fg);

    &:hover {
      background: var(--nd-buttonHoverBg);
    }

    &.feedback {
      color: var(--nd-accent);
    }
  }
}

.secondary { /* modifier */ }
.feedback { /* modifier */ }
</style>
