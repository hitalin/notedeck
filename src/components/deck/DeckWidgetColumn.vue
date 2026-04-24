<script setup lang="ts">
import { computed, defineAsyncComponent, useTemplateRef } from 'vue'
import ColumnEmptyState from '@/components/common/ColumnEmptyState.vue'
import { useColumnTheme } from '@/composables/useColumnTheme'
import { useServerImages } from '@/composables/useServerImages'
import type { DeckColumn as DeckColumnType } from '@/stores/deck'
import { useDeckStore } from '@/stores/deck'
import { useWidgetsStore } from '@/stores/widgets'
import DeckColumn from './DeckColumn.vue'
import DeckHeaderAccount from './DeckHeaderAccount.vue'

const WidgetAiScript = defineAsyncComponent(
  () => import('./widgets/WidgetAiScript.vue'),
)

const props = defineProps<{
  column: DeckColumnType
}>()

const deckStore = useDeckStore()
const widgetsStore = useWidgetsStore()
widgetsStore.ensureLoaded()

const { account, columnThemeVars } = useColumnTheme(() => props.column)
const { serverIconUrl, serverInfoImageUrl } = useServerImages(
  () => props.column,
)

/**
 * sidebar widget カラム (ナビバートグルで開閉) は sidebarWidgetIds[] を参照し、
 * non-sidebar widget カラムはカラム自身の widgetIds[] を参照する。
 * 追加・削除の責務は deckStore 側に集約 (sidebar 判定は内部で実施)。
 */
const isSidebar = computed(() => props.column.sidebar === true)

const widgets = computed(() => {
  const ids = isSidebar.value
    ? widgetsStore.sidebarWidgetIds
    : (props.column.widgetIds ?? [])
  return ids
    .map((id) => widgetsStore.getWidget(id))
    .filter((w): w is NonNullable<typeof w> => w !== undefined)
})

const showEmptyState = computed(
  () => widgets.value.length === 0 && props.column.accountId !== null,
)

function addWidget() {
  deckStore.addWidget(props.column.id)
}

const widgetBodyRef = useTemplateRef<HTMLElement>('widgetBodyRef')

function scrollToTop() {
  widgetBodyRef.value?.scrollTo({ top: 0, behavior: 'smooth' })
}

function handleRemove(installId: string) {
  deckStore.removeWidget(props.column.id, installId)
}
</script>

<template>
  <DeckColumn :column-id="column.id" :title="column.name ?? 'ウィジェット'" :theme-vars="columnThemeVars" data-column-type="widget" @header-click="scrollToTop">
    <template #header-icon>
      <i class="ti ti-app-window" />
    </template>

    <template #header-meta>
      <DeckHeaderAccount :account="account" :server-icon-url="serverIconUrl" />
    </template>

    <div ref="widgetBodyRef" :class="$style.widgetColumnBody">
      <ColumnEmptyState
        v-if="showEmptyState"
        message="ウィジェットを追加してカスタマイズしよう"
        :image-url="serverInfoImageUrl"
      />

      <div v-for="widget in widgets" :key="widget.installId" :class="$style.widgetItem">
        <WidgetAiScript
          :widget="widget"
          :column-id="column.id"
          :account-id="column.accountId"
          :is-sidebar="isSidebar"
          @remove="handleRemove(widget.installId)"
        />
      </div>

      <div :class="$style.addWidgetArea">
        <button :class="$style.addWidgetBtn" @click="addWidget">
          <i class="ti ti-plus" /> Add Widget
        </button>
      </div>
    </div>
  </DeckColumn>
</template>

<style lang="scss" module>
.widgetColumnBody {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 10px;
  overflow-y: auto;
  flex: 1;
  min-height: 0;
}

.widgetItem {
  border: 1px solid var(--nd-divider);
  border-radius: 10px;
  background: var(--nd-panel);
  overflow: hidden;
  contain: layout style paint;
  content-visibility: auto;
}

.addWidgetArea {
  display: flex;
  justify-content: center;
  padding: 6px;
}

.addWidgetBtn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 7px 16px;
  border: 1px dashed var(--nd-divider);
  border-radius: var(--nd-radius-md);
  background: none;
  color: var(--nd-fg);
  cursor: pointer;
  font-size: 0.85em;
  opacity: 0.5;
  transition: opacity var(--nd-duration-base), border-color var(--nd-duration-base);

  &:hover {
    opacity: 1;
    border-color: var(--nd-accent);
    color: var(--nd-accent);
  }
}

/* ウィジェットカラムのヘッダーはプレーンに（Misskey本家準拠） */
:global(.deck-column[data-column-type="widget"]) {
  :global(.column-header) {
    background: var(--nd-panel);
    box-shadow: none;
    border-bottom: 1px solid var(--nd-divider);
  }

  :global(.color-indicator) {
    display: none;
  }
}
</style>

