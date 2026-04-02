<script setup lang="ts">
import { computed, ref, useTemplateRef } from 'vue'
import { useColumnTheme } from '@/composables/useColumnTheme'
import type { DeckColumn as DeckColumnType } from '@/stores/deck'
import { useDeckStore } from '@/stores/deck'
import DeckColumn from './DeckColumn.vue'
import { getWidgetComponent, getWidgetDefinitions } from './widgets/registry'

const props = defineProps<{
  column: DeckColumnType
}>()

const deckStore = useDeckStore()
const showAddMenu = ref(false)

const { columnThemeVars } = useColumnTheme(() => props.column)

const widgets = computed(() => props.column.widgets ?? [])

const widgetDefinitions = getWidgetDefinitions()

function addWidget(type: (typeof widgetDefinitions)[number]['type']) {
  deckStore.addWidget(props.column.id, type)
  showAddMenu.value = false
}

const widgetBodyRef = useTemplateRef<HTMLElement>('widgetBodyRef')

function scrollToTop() {
  widgetBodyRef.value?.scrollTo({ top: 0, behavior: 'smooth' })
}

function removeWidget(widgetId: string) {
  deckStore.removeWidget(props.column.id, widgetId)
}
</script>

<template>
  <DeckColumn :column-id="column.id" :title="column.name ?? 'ウィジェット'" :theme-vars="columnThemeVars" data-column-type="widget" @header-click="scrollToTop">
    <template #header-icon>
      <i class="ti ti-app-window" />
    </template>

    <div ref="widgetBodyRef" :class="$style.widgetColumnBody">
      <div v-for="widget in widgets" :key="widget.id" :class="$style.widgetItem">
        <div :class="$style.widgetHeader">
          <span :class="$style.widgetLabel">
            <i
              :class="'ti ' + (getWidgetComponent(widget.type)?.icon ?? 'ti-puzzle')"
            />
            {{ getWidgetComponent(widget.type)?.label ?? widget.type }}
          </span>
          <button :class="$style.widgetRemove" @click="removeWidget(widget.id)">
            <i class="ti ti-x" />
          </button>
        </div>
        <div :class="$style.widgetContent">
          <component
            :is="getWidgetComponent(widget.type)?.component"
            :widget="widget"
            :column-id="column.id"
            :account-id="column.accountId"
          />
        </div>
      </div>

      <div :class="$style.addWidgetArea">
        <button
          v-if="!showAddMenu"
          :class="$style.addWidgetBtn"
          @click="showAddMenu = true"
        >
          <i class="ti ti-plus" /> Add Widget
        </button>
        <div v-else :class="$style.addWidgetMenu">
          <button
            v-for="def in widgetDefinitions"
            :key="def.type"
            :class="$style.menuItem"
            @click="addWidget(def.type)"
          >
            <i :class="'ti ' + def.icon" />
            {{ def.label }}
          </button>
          <button :class="[$style.menuItem, $style.cancel]" @click="showAddMenu = false">
            キャンセル
          </button>
        </div>
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

.widgetHeader {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 10px;
  border-bottom: 1px solid var(--nd-divider);
  font-size: 0.85em;
  background: var(--nd-panelHeaderBg);
  color: var(--nd-panelHeaderFg);
}

.widgetLabel {
  display: flex;
  align-items: center;
  gap: 6px;
  font-weight: 500;
  opacity: 0.8;
}

.widgetRemove {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border: none;
  background: none;
  color: var(--nd-fg);
  cursor: pointer;
  border-radius: var(--nd-radius-sm);
  opacity: 0.35;
  transition: opacity var(--nd-duration-base), background var(--nd-duration-base);

  &:hover {
    opacity: 1;
    color: var(--nd-love);
    background: var(--nd-love-subtle);
  }
}

.widgetContent {
  padding: 10px;
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

.addWidgetMenu {
  display: flex;
  flex-direction: column;
  gap: 4px;
  width: 100%;
}

.menuItem {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  border: none;
  border-radius: var(--nd-radius-sm);
  background: var(--nd-buttonBg);
  color: var(--nd-fg);
  cursor: pointer;
  font-size: 0.85em;
  text-align: left;
  transition: background var(--nd-duration-base);

  &:hover {
    background: var(--nd-buttonHoverBg);
  }

  &.cancel {
    justify-content: center;
    opacity: 0.5;
  }
}

.menuSectionLabel {
  padding: 6px 12px 2px;
  font-size: 0.75em;
  font-weight: 600;
  opacity: 0.45;
  text-transform: uppercase;
  letter-spacing: 0.04em;
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

