<script setup lang="ts">
import { json } from '@codemirror/lang-json'
import JSON5 from 'json5'
import { computed, defineAsyncComponent, reactive, ref, watch } from 'vue'
import ColumnBadges from '@/components/common/ColumnBadges.vue'
import EditorTabs from '@/components/common/EditorTabs.vue'
import type { ReorderableItem } from '@/components/common/ReorderableList.vue'
import ReorderableList from '@/components/common/ReorderableList.vue'
import { useClipboardFeedback } from '@/composables/useClipboardFeedback'
import {
  COLUMN_ICONS,
  COLUMN_LABELS,
  TL_ICONS,
} from '@/composables/useColumnTabs'
import { useEditorTabs } from '@/composables/useEditorTabs'
import { usePointerReorder } from '@/composables/usePointerReorder'
import { getAccountAvatarUrl, useAccountsStore } from '@/stores/accounts'
import type { DeckColumn } from '@/stores/deck'
import { useDeckStore } from '@/stores/deck'
import { useDeckProfileStore } from '@/stores/deckProfile'
import { useServersStore } from '@/stores/servers'
import { useIsCompactLayout } from '@/stores/ui'
import { createJson5Linter } from '@/utils/json5Linter'

const AddColumnDialog = defineAsyncComponent(
  () => import('@/components/deck/AddColumnDialog.vue'),
)
const CodeEditor = defineAsyncComponent(
  () => import('@/components/deck/widgets/CodeEditor.vue'),
)

const jsonLang = json()
const jsonLinter = createJson5Linter()

const accountsStore = useAccountsStore()
const serversStore = useServersStore()
const deckStore = useDeckStore()
const profileStore = useDeckProfileStore()
const isCompact = useIsCompactLayout()

const expandedSections = reactive<Record<string, boolean>>({})

function toggleSection(key: string) {
  expandedSections[key] = !expandedSections[key]
}

const codeContent = ref('')
const codeError = ref<string | null>(null)

const { tab, containerRef: editorRef } = useEditorTabs(
  ['visual', 'code'] as const,
  'visual',
)

function columnLabel(col: DeckColumn): string {
  if (col.name) return col.name
  const typeLabel = COLUMN_LABELS[col.type] ?? col.type
  if (col.tl) return `${typeLabel} (${col.tl})`
  return typeLabel
}

function columnIcon(col: DeckColumn): string {
  if (col.type === 'timeline' && col.tl) {
    return TL_ICONS[col.tl] ?? COLUMN_ICONS.timeline ?? 'layout-columns'
  }
  return COLUMN_ICONS[col.type] ?? 'layout-columns'
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

// --- Mobile: ReorderableList items ---
const reorderableGroups = computed<ReorderableItem[]>(() =>
  deckStore.windowLayout.map((group) => {
    const col = groupPrimaryColumn(group)
    return {
      icon: col ? columnIcon(col) : 'layout-columns',
      label: groupLabel(group),
      avatarUrl: groupAvatarUrl(group),
      serverIconUrl: groupServerIconUrl(group),
      stackCount: group.length,
    }
  }),
)

// --- Add column via inline AddColumnDialog ---
const showAddColumn = ref(false)

function onColumnSelected(config: Omit<DeckColumn, 'id'>) {
  deckStore.addColumn(config)
  showAddColumn.value = false
}

// --- Drag and drop (reorder layout groups) ---

function onGroupReorder(fromIdx: number, toIdx: number) {
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

const { dragFromIndex, dragOverIndex, startDrag } = usePointerReorder({
  dataAttr: 'group-idx',
  onReorder: onGroupReorder,
})

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
    <EditorTabs
      v-model="tab"
      :tabs="[
        { value: 'visual', icon: 'layout-columns', label: 'ビジュアル' },
        { value: 'code', icon: 'code', label: 'コード' },
      ]"
    />

    <!-- Visual Editor -->
    <div v-if="tab === 'visual'" :class="$style.visualPanel">
      <!-- Profile name -->
      <div :class="$style.nameSection">
        <button class="_button" :class="$style.nameLabel" @click="toggleSection('name')">
          <i class="ti ti-tag" />
          プロファイル名
          <i class="ti ti-chevron-down" :class="[$style.chevron, { [$style.chevronOpen]: expandedSections.name }]" />
        </button>
        <input
          v-if="expandedSections.name"
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
        <button class="_button" :class="$style.sectionLabel" @click="toggleSection('columns')">
          <i class="ti ti-columns" />
          カラム
          <span :class="$style.sectionBadge">{{ deckStore.windowLayout.length }}</span>
          <i class="ti ti-chevron-down" :class="[$style.chevron, { [$style.chevronOpen]: expandedSections.columns }]" />
        </button>

        <template v-if="expandedSections.columns">
        <!-- Mobile: row-based list with drag & drop -->
        <ReorderableList
          v-if="isCompact"
          :items="reorderableGroups"
          data-attr="group-idx"
          empty-text="カラムがありません"
          @reorder="onGroupReorder"
          @remove="removeGroup"
        />

        <!-- Desktop: icon grid with drag & drop -->
        <div v-else :class="$style.columnPreview">
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
            <div :class="$style.iconWrap">
              <i v-if="groupPrimaryColumn(group)" :class="'ti ti-' + columnIcon(groupPrimaryColumn(group)!)" />
              <span v-if="group.length > 1" :class="$style.stackBadge">{{ group.length }}</span>
              <ColumnBadges :account-id="groupPrimaryColumn(group)?.accountId" :size="14" />
            </div>
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

          <!-- Add column button -->
          <div
            :class="[$style.columnTab, $style.addColumnTab]"
            title="カラムを追加"
            @click="showAddColumn = !showAddColumn"
          >
            <i class="ti ti-plus" />
          </div>
        </div>

        <!-- Add column button (mobile) -->
        <div
          v-if="isCompact"
          :class="[$style.columnTab, $style.addColumnTab]"
          title="カラムを追加"
          @click="showAddColumn = !showAddColumn"
        >
          <i class="ti ti-plus" />
        </div>

        <!-- Inline AddColumnDialog -->
        <AddColumnDialog
          v-if="showAddColumn"
          mode="pip"
          @column-selected="onColumnSelected"
          @close="showAddColumn = false"
        />
        </template>
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
  width: 100%;
  font-size: 0.8em;
  font-weight: bold;
  opacity: 0.7;
  cursor: pointer;
  transition: opacity var(--nd-duration-base);

  &:hover {
    opacity: 1;
  }
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
  width: 100%;
  font-size: 0.8em;
  font-weight: bold;
  opacity: 0.7;
  cursor: pointer;
  transition: opacity var(--nd-duration-base);

  &:hover {
    opacity: 1;
  }
}

.chevron {
  margin-left: auto;
  font-size: 0.9em;
  transition: transform var(--nd-duration-base);
  transform: rotate(-90deg);
}

.chevronOpen {
  transform: rotate(0deg);
}

.sectionBadge {
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
  color: var(--nd-fg);
  opacity: 0.6;
  border-radius: var(--nd-radius-sm);
  cursor: grab;
  user-select: none;
  --column-badge-border: var(--nd-panel);
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

  &.addColumnTab {
    cursor: pointer;
    opacity: 0.3;
    border: 1px dashed var(--nd-divider);

    &:hover {
      opacity: 0.8;
      border-color: var(--nd-accent);
      color: var(--nd-accent);
    }
  }
}

.iconWrap {
  @include nav-icon-wrap;

  :global(.ti) {
    @include nav-icon;
    opacity: 0.7;
    transition: opacity var(--nd-duration-base);
  }

  .columnTab:hover & :global(.ti) {
    opacity: 1;
  }
}

.stackBadge { @include nav-stack-badge; }

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
  transition: opacity var(--nd-duration-fast), filter var(--nd-duration-base);

  .columnTab:hover & {
    opacity: 1;
  }

  &:hover {
    filter: brightness(0.85);
  }
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
