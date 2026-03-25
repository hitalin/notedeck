<script setup lang="ts">
import JSON5 from 'json5'
import { defineAsyncComponent, ref, watch } from 'vue'
import EditorTabs from '@/components/common/EditorTabs.vue'
import { useClipboardFeedback } from '@/composables/useClipboardFeedback'
import { COLUMN_ICONS, COLUMN_LABELS } from '@/composables/useColumnTabs'
import { useDoubleConfirm } from '@/composables/useDoubleConfirm'
import { useEditorTabs } from '@/composables/useEditorTabs'
import type { DeckColumn } from '@/stores/deck'
import {
  DEFAULT_NAV_ITEMS,
  isNavDivider,
  type NavItem,
  useDeckStore,
} from '@/stores/deck'

const AddColumnDialog = defineAsyncComponent(
  () => import('@/components/deck/AddColumnDialog.vue'),
)
const CodeEditor = defineAsyncComponent(
  () => import('@/components/deck/widgets/CodeEditor.vue'),
)

const deckStore = useDeckStore()

// ── Tab management ──
const { tab, containerRef: contentRef } = useEditorTabs(
  ['visual', 'code'] as const,
  'visual',
)

function getItemIcon(item: NavItem): string {
  if (isNavDivider(item)) return 'ti-separator'
  return `ti-${COLUMN_ICONS[item.type] ?? 'layout-grid'}`
}

function getItemLabel(item: NavItem): string {
  if (isNavDivider(item)) return '区切り線'
  return COLUMN_LABELS[item.type] ?? item.type
}

// ── Visual tab state ──
const items = ref<NavItem[]>(structuredClone(deckStore.navItems))

watch(items, (v) => deckStore.setNavItems(v), { deep: true })

function moveUp(index: number) {
  if (index <= 0) return
  const arr = [...items.value]
  const a = arr[index - 1]
  const b = arr[index]
  if (a === undefined || b === undefined) return
  arr[index - 1] = b
  arr[index] = a
  items.value = arr
}

function moveDown(index: number) {
  if (index >= items.value.length - 1) return
  const arr = [...items.value]
  const a = arr[index]
  const b = arr[index + 1]
  if (a === undefined || b === undefined) return
  arr[index] = b
  arr[index + 1] = a
  items.value = arr
}

function removeItem(index: number) {
  items.value.splice(index, 1)
}

function addDivider() {
  items.value.push({ type: 'divider' })
}

// ── Add via AddColumnDialog ──
const showAddColumn = ref(false)

function onColumnSelected(config: Omit<DeckColumn, 'id'>) {
  items.value.push({
    type: config.type,
    accountId: config.accountId,
  })
  showAddColumn.value = false
}

// ── Code tab ──
function itemsToJson(): string {
  return JSON5.stringify(items.value, null, 2)
}

const jsonCode = ref(itemsToJson())
const codeError = ref<string | null>(null)

watch(tab, (t) => {
  if (t === 'code') {
    jsonCode.value = itemsToJson()
    codeError.value = null
  }
})

watch(items, () => {
  if (tab.value === 'code') {
    const storeJson = itemsToJson()
    if (storeJson !== jsonCode.value) {
      jsonCode.value = storeJson
    }
  }
})

function applyFromCode() {
  const code = jsonCode.value
  try {
    const parsed = JSON5.parse(code)
    if (!Array.isArray(parsed)) {
      codeError.value = '配列が必要です'
      return
    }
    items.value = parsed as NavItem[]
    codeError.value = null
  } catch (e) {
    codeError.value = e instanceof Error ? e.message : '無効な JSON5'
  }
}

// ── Actions ──
const { copiedMessage, showCopied } = useClipboardFeedback()
const { confirming: confirmingReset, trigger: handleReset } = useDoubleConfirm(
  () => {
    items.value = structuredClone(DEFAULT_NAV_ITEMS)
  },
)

async function exportNav() {
  try {
    await navigator.clipboard.writeText(itemsToJson())
    showCopied()
  } catch {
    /* clipboard access denied */
  }
}

async function importNav() {
  try {
    const text = await navigator.clipboard.readText()
    const parsed = JSON5.parse(text)
    if (!Array.isArray(parsed)) return
    items.value = parsed as NavItem[]
  } catch {
    /* clipboard access denied or invalid */
  }
}
</script>

<template>
  <div ref="contentRef" :class="$style.editor">
    <EditorTabs
      v-model="tab"
      :tabs="[
        { value: 'visual', icon: 'adjustments', label: 'ビジュアル' },
        { value: 'code', icon: 'code', label: 'コード' },
      ]"
    />

    <!-- Visual tab -->
    <div v-show="tab === 'visual'" :class="$style.visualPanel">
      <div :class="$style.section">
        <div :class="$style.sectionLabel">
          <i class="ti ti-layout-sidebar-left-collapse" />
          <span>ナビバーの項目</span>
        </div>
        <div :class="$style.itemList">
          <div
            v-for="(item, i) in items"
            :key="i"
            :class="$style.itemRow"
          >
            <div :class="$style.moveButtons">
              <button
                class="_button"
                :class="$style.moveBtn"
                :disabled="i === 0"
                title="上に移動"
                @click="moveUp(i)"
              >
                <i class="ti ti-chevron-up" />
              </button>
              <button
                class="_button"
                :class="$style.moveBtn"
                :disabled="i === items.length - 1"
                title="下に移動"
                @click="moveDown(i)"
              >
                <i class="ti ti-chevron-down" />
              </button>
            </div>
            <template v-if="isNavDivider(item)">
              <div :class="$style.dividerLine" />
              <span :class="$style.dividerLabel">区切り線</span>
            </template>
            <template v-else>
              <i :class="['ti', getItemIcon(item)]" :style="{ opacity: 0.7 }" />
              <span :class="$style.itemLabel">{{ getItemLabel(item) }}</span>
              <span v-if="item.accountId" :class="$style.accountHint">
                {{ item.accountId.slice(0, 8) }}
              </span>
            </template>
            <button class="_button" :class="$style.removeBtn" title="削除" @click="removeItem(i)">
              <i class="ti ti-x" />
            </button>
          </div>
          <div v-if="items.length === 0" :class="$style.empty">項目がありません</div>
        </div>
      </div>

      <div :class="$style.section">
        <div :class="$style.addButtons">
          <button class="_button" :class="$style.addShortcutBtn" @click="showAddColumn = true">
            <i class="ti ti-plus" />
            <span>カラムを追加</span>
          </button>
          <button class="_button" :class="$style.addShortcutBtn" @click="addDivider">
            <i class="ti ti-separator" />
            <span>区切り線</span>
          </button>
        </div>
      </div>

      <!-- Inline AddColumnDialog -->
      <AddColumnDialog
        v-if="showAddColumn"
        mode="pip"
        @column-selected="onColumnSelected"
        @close="showAddColumn = false"
      />
    </div>

    <!-- Code tab -->
    <div v-show="tab === 'code'" :class="$style.codePanel">
      <div :class="$style.codeHint">
        ナビバー項目の JSON5 配列（コピーしてバックアップ可能）
      </div>
      <CodeEditor
        v-model="jsonCode"
        :class="[$style.codeEditorWrap, { [$style.hasError]: codeError }]"
      />
      <div v-if="codeError" :class="$style.errorMessage">
        <i class="ti ti-alert-triangle" />
        {{ codeError }}
      </div>
      <div v-if="!codeError && jsonCode.trim() && jsonCode.trim() !== '[]'" :class="$style.codeSuccess">
        <i class="ti ti-check" />
        適用中
      </div>
      <button class="_button" :class="$style.codeApplyBtn" @click="applyFromCode">
        <i class="ti ti-refresh" />
        ビジュアルに同期
      </button>
    </div>

    <!-- Actions (footer) -->
    <div :class="$style.actions">
      <div :class="$style.actionGroup">
        <button
          class="_button"
          :class="[$style.actionBtn, $style.secondary]"
          @click="importNav"
        >
          <i class="ti ti-clipboard-text" />
          インポート
        </button>
        <button
          class="_button"
          :class="[$style.actionBtn, $style.secondary, { [$style.feedback]: copiedMessage }]"
          @click="exportNav"
        >
          <i class="ti ti-clipboard-copy" />
          {{ copiedMessage ? 'コピー済み' : 'エクスポート' }}
        </button>
      </div>
      <button
        class="_button"
        :class="[$style.actionBtn, $style.danger, { [$style.confirming]: confirmingReset }]"
        @click="handleReset"
      >
        <i class="ti ti-trash" />
        {{ confirmingReset ? '本当にリセット？' : 'デフォルトに戻す' }}
      </button>
    </div>
  </div>
</template>

<style lang="scss" module>
@use '@/styles/buttons' as *;

.editor {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
}

// ── Visual tab ──

.visualPanel {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  scrollbar-color: var(--nd-scrollbarHandle) transparent;
  scrollbar-width: thin;
}

.section {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px 10px;
  border-bottom: 1px solid var(--nd-divider);
}

.sectionLabel {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 0.8em;
  font-weight: bold;
  opacity: 0.7;
}

.itemList {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.itemRow {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 8px;
  border-radius: var(--nd-radius-sm);
  transition: background var(--nd-duration-fast);

  &:hover {
    background: color-mix(in srgb, var(--nd-accent) 8%, transparent);
  }
}

.dividerLine {
  flex: 0 0 16px;
  height: 1px;
  background: var(--nd-divider);
}

.dividerLabel {
  flex: 1;
  font-size: 0.75em;
  color: var(--nd-fg);
  opacity: 0.4;
}

.moveButtons {
  display: flex;
  flex-direction: column;
  gap: 1px;
  flex-shrink: 0;
}

.moveBtn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 12px;
  border-radius: 2px;
  color: var(--nd-fg);
  font-size: 0.7em;
  opacity: 0.4;
  transition:
    opacity var(--nd-duration-base),
    background var(--nd-duration-base);

  &:hover:not(:disabled) {
    opacity: 1;
    background: var(--nd-buttonHoverBg);
  }

  &:disabled {
    opacity: 0.15;
  }
}

.itemLabel {
  flex: 1;
  font-size: 0.85em;
}

.accountHint {
  font-size: 0.7em;
  opacity: 0.4;
  font-family: monospace;
}

.removeBtn {
  display: flex;
  align-items: center;
  font-size: 0.9em;
  opacity: 0;
  color: var(--nd-fg);
  transition: opacity var(--nd-duration-base);

  .itemRow:hover & {
    opacity: 0.3;
  }

  &:hover {
    opacity: 1 !important;
    color: var(--nd-love, #ec4137);
  }
}

.empty {
  padding: 12px;
  text-align: center;
  color: var(--nd-fg);
  opacity: 0.4;
  font-size: 0.8em;
}

// ── Add buttons ──

.addButtons {
  display: flex;
  gap: 8px;
}

.addShortcutBtn {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 4px 8px;
  border-radius: 4px;
  font-size: 0.8em;
  color: var(--nd-fg);
  opacity: 0.4;
  transition:
    opacity var(--nd-duration-base),
    background var(--nd-duration-base);

  &:hover {
    opacity: 1;
    background: var(--nd-buttonHoverBg);
  }
}

// ── Code tab ──

.codePanel {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 10px;
  flex: 1;
  min-height: 0;
  overflow-y: auto;
}

.codeHint {
  font-size: 0.75em;
  opacity: 0.5;
}

.codeEditorWrap {
  flex: 1;
  min-height: 120px;
  border: 1px solid var(--nd-divider);
  border-radius: var(--nd-radius-sm);
  overflow: hidden;

  &.hasError {
    border-color: var(--nd-love, #ec4137);
  }
}

.errorMessage {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 0.75em;
  color: var(--nd-love, #ec4137);
}

.codeSuccess {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 0.75em;
  color: var(--nd-accent);
  opacity: 0.7;
}

.codeApplyBtn {
  @include btn-secondary;
}

// ── Actions (footer) ──

.actions {
  @include action-bar;
}

.actionGroup {
  @include action-group;
}

.actionBtn {
  &.secondary {
    @include btn-action;
  }

  &.danger {
    @include btn-danger-ghost;
  }
}

.secondary {
  /* modifier */
}

.feedback {
  /* modifier */
}

.danger {
  /* modifier */
}

.confirming {
  /* modifier */
}
</style>
