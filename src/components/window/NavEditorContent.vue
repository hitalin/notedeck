<script setup lang="ts">
import { json } from '@codemirror/lang-json'
import JSON5 from 'json5'
import { defineAsyncComponent, ref, watch } from 'vue'
import ColumnBadges from '@/components/common/ColumnBadges.vue'
import EditorTabs from '@/components/common/EditorTabs.vue'
import { useClipboardFeedback } from '@/composables/useClipboardFeedback'
import { COLUMN_ICONS, COLUMN_LABELS } from '@/composables/useColumnTabs'
import { useDoubleConfirm } from '@/composables/useDoubleConfirm'
import { useEditorTabs } from '@/composables/useEditorTabs'
import { usePointerReorder } from '@/composables/usePointerReorder'
import type { DeckColumn } from '@/stores/deck'
import {
  DEFAULT_NAV_ITEMS,
  isNavDivider,
  type NavItem,
  useDeckStore,
} from '@/stores/deck'
import { useIsCompactLayout } from '@/stores/ui'

const AddColumnDialog = defineAsyncComponent(
  () => import('@/components/deck/AddColumnDialog.vue'),
)
const CodeEditor = defineAsyncComponent(
  () => import('@/components/deck/widgets/CodeEditor.vue'),
)

const deckStore = useDeckStore()
const isCompact = useIsCompactLayout()
const jsonLang = json()

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

function removeItem(index: number) {
  items.value.splice(index, 1)
}

function moveItem(index: number, direction: -1 | 1) {
  const target = index + direction
  if (target < 0 || target >= items.value.length) return
  const arr = [...items.value]
  const [moved] = arr.splice(index, 1)
  if (moved) {
    arr.splice(target, 0, moved)
    items.value = arr
  }
}

function addDivider() {
  items.value.push({ type: 'divider' })
}

// ── Pointer-based drag & drop ──
const { dragFromIndex, dragOverIndex, startDrag } = usePointerReorder({
  axis: 'y',
  dataAttr: 'nav-idx',
  onReorder(fromIdx, toIdx) {
    const arr = [...items.value]
    const [moved] = arr.splice(fromIdx, 1)
    if (moved) {
      arr.splice(toIdx, 0, moved)
      items.value = arr
    }
  },
})

// ── Add via AddColumnDialog ──
function onColumnSelected(config: Omit<DeckColumn, 'id'>) {
  items.value.push({
    type: config.type,
    accountId: config.accountId,
  })
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
const { copied: copiedMessage, showCopied } = useClipboardFeedback()
const { confirming: confirmingReset, trigger: triggerReset } =
  useDoubleConfirm()

function handleReset() {
  triggerReset(() => {
    items.value = structuredClone(DEFAULT_NAV_ITEMS)
  })
}

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
      <!-- Mobile: horizontal row list with move buttons -->
      <div v-if="isCompact" :class="$style.mobilePanel">
        <div :class="$style.mobileList">
          <div
            v-for="(item, i) in items"
            :key="i"
            :class="[$style.mobileRow, { [$style.mobileRowDivider]: isNavDivider(item) }]"
          >
            <span :class="$style.mobileIcon">
              <i :class="['ti', getItemIcon(item)]" />
            </span>
            <span :class="$style.mobileLabel">{{ getItemLabel(item) }}</span>
            <ColumnBadges v-if="!isNavDivider(item)" :account-id="item.accountId" :size="10" />
            <div :class="$style.mobileActions">
              <button class="_button" :class="$style.mobileBtn" :disabled="i === 0" @click="moveItem(i, -1)">
                <i class="ti ti-chevron-up" />
              </button>
              <button class="_button" :class="$style.mobileBtn" :disabled="i === items.length - 1" @click="moveItem(i, 1)">
                <i class="ti ti-chevron-down" />
              </button>
              <button class="_button" :class="[$style.mobileBtn, $style.mobileBtnDanger]" @click="removeItem(i)">
                <i class="ti ti-x" />
              </button>
            </div>
          </div>
          <div v-if="items.length === 0" :class="$style.empty">項目なし</div>
        </div>

        <button class="_button" :class="$style.mobileAddDivider" @click="addDivider">
          <i class="ti ti-separator" />
          区切り線を追加
        </button>

        <AddColumnDialog
          mode="pip"
          @column-selected="onColumnSelected"
        />
      </div>

      <!-- Desktop: icon grid with drag & drop -->
      <div v-else :class="$style.columns">
        <!-- Left: nav preview (vertical, drag & drop) -->
        <div :class="$style.previewPane">

          <div :class="$style.navPreview">
            <template v-for="(item, i) in items" :key="i">
              <div v-if="isNavDivider(item)"
                :data-nav-idx="i"
                :class="[$style.navDividerTab, { [$style.dragging]: dragFromIndex === i, [$style.dragOver]: dragOverIndex === i }]"
                :title="'区切り線'"
                @pointerdown="startDrag(i, $event)"
              >
                <div :class="$style.navDividerLine" />
                <button class="_button" :class="$style.tabRemoveBtn" @click.stop="removeItem(i)">
                  <i class="ti ti-x" />
                </button>
              </div>
              <div v-else
                :data-nav-idx="i"
                :class="[$style.navTab, { [$style.dragging]: dragFromIndex === i, [$style.dragOver]: dragOverIndex === i }]"
                :title="getItemLabel(item)"
                @pointerdown="startDrag(i, $event)"
              >
                <i :class="['ti', getItemIcon(item)]" />
                <ColumnBadges :account-id="item.accountId" :size="10" />
                <button class="_button" :class="$style.tabRemoveBtn" @click.stop="removeItem(i)">
                  <i class="ti ti-x" />
                </button>
              </div>
            </template>
            <div v-if="items.length === 0" :class="$style.empty">項目なし</div>

            <!-- Add divider button -->
            <div :class="$style.navDividerTab" :title="'区切り線を追加'" @click="addDivider">
              <i class="ti ti-separator" />
            </div>
          </div>
        </div>

        <!-- Right: AddColumnDialog (pip, always visible) -->
        <div :class="$style.addPane">
          <AddColumnDialog
            mode="pip"
            @column-selected="onColumnSelected"
          />
        </div>
      </div>
    </div>

    <!-- Code tab -->
    <div v-show="tab === 'code'" :class="$style.codePanel">
      <div :class="$style.codeHint">
        ナビバー項目の JSON5 配列（コピーしてバックアップ可能）
      </div>
      <CodeEditor
        v-model="jsonCode"
        :language="jsonLang"
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
}

.columns {
  display: flex;
  flex: 1;
  min-height: 0;
}

// ── Left: nav preview ──

.previewPane {
  display: flex;
  flex-direction: column;
  padding: 8px 0;
  border-right: 1px solid var(--nd-divider);
  width: 56px;
  flex-shrink: 0;
  overflow-y: auto;
  scrollbar-width: thin;
}

.navPreview {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  padding: 8px 4px;
  background: var(--nd-panel);
  border-radius: var(--nd-radius-sm);
}

// Mirrors collapsed navbar icon style (44×44, circle)
.navTab {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 44px;
  height: 44px;
  margin: 2px auto;
  font-size: 1rem;
  color: var(--nd-navFg, var(--nd-fg));
  opacity: 0.7;
  border-radius: 50%;
  cursor: grab;
  user-select: none;
  transition:
    opacity var(--nd-duration-base),
    background var(--nd-duration-base);

  :global(.ti) {
    font-size: 1.5em;
  }

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

.navDividerTab {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 44px;
  height: 24px;
  margin: 2px auto;
  border-radius: 12px;
  cursor: grab;
  user-select: none;

  &:hover {
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

.navDividerLine {
  width: 24px;
  height: 1px;
  background: var(--nd-divider);
}

.tabRemoveBtn {
  position: absolute;
  top: -2px;
  right: -2px;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 14px;
  height: 14px;
  border-radius: 50%;
  background: var(--nd-panel);
  font-size: 8px;
  color: var(--nd-fg);
  opacity: 0;
  transition: opacity var(--nd-duration-fast);

  .navTab:hover &,
  .navDividerTab:hover & {
    opacity: 1;
  }

  &:hover {
    color: var(--nd-love, #ec4137);
  }
}

// ── Mobile: row-based list ──

.mobilePanel {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  scrollbar-width: thin;
}

.mobileList {
  display: flex;
  flex-direction: column;
}

.mobileRow {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  border-bottom: 1px solid var(--nd-divider);

  &.mobileRowDivider {
    opacity: 0.6;
  }
}

.mobileIcon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  flex-shrink: 0;
  font-size: 1.1em;
  color: var(--nd-fg);
}

.mobileLabel {
  flex: 1;
  min-width: 0;
  font-size: 0.85em;
  color: var(--nd-fg);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.mobileActions {
  display: flex;
  align-items: center;
  gap: 2px;
  flex-shrink: 0;
}

.mobileBtn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border-radius: var(--nd-radius-sm);
  color: var(--nd-fg);
  opacity: 0.6;
  transition: opacity var(--nd-duration-fast), background var(--nd-duration-fast);

  &:hover {
    opacity: 1;
    background: var(--nd-buttonHoverBg);
  }

  &:disabled {
    opacity: 0.2;
    pointer-events: none;
  }

  &.mobileBtnDanger:hover {
    color: var(--nd-love, #ec4137);
  }
}

.mobileAddDivider {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 10px 12px;
  font-size: 0.8em;
  color: var(--nd-fg);
  opacity: 0.5;
  border-bottom: 1px solid var(--nd-divider);
  transition: opacity var(--nd-duration-fast);

  &:hover {
    opacity: 0.8;
  }
}

.empty {
  padding: 8px;
  text-align: center;
  color: var(--nd-fg);
  opacity: 0.4;
  font-size: 0.75em;
}

// ── Right: AddColumnDialog ──

.addPane {
  flex: 1;
  min-width: 0;
  overflow-y: auto;
  scrollbar-width: thin;
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
