<script setup lang="ts">
import { ref, computed } from 'vue'
import DeckColumn from './DeckColumn.vue'
import { useDeckStore } from '@/stores/deck'
import type { DeckColumn as DeckColumnType } from '@/stores/deck'
import { getWidgetDefinitions, getWidgetComponent } from './widgets/registry'

const props = defineProps<{
  column: DeckColumnType
}>()

const deckStore = useDeckStore()
const showAddMenu = ref(false)

const widgets = computed(() => props.column.widgets ?? [])

const widgetDefinitions = getWidgetDefinitions()

function addWidget(type: (typeof widgetDefinitions)[number]['type']) {
  deckStore.addWidget(props.column.id, type)
  showAddMenu.value = false
}

function removeWidget(widgetId: string) {
  deckStore.removeWidget(props.column.id, widgetId)
}
</script>

<template>
  <DeckColumn :column-id="column.id" :title="column.name ?? 'Widgets'">
    <template #header-icon>
      <i class="ti ti-app-window" />
    </template>

    <div class="widget-column-body">
      <div v-for="widget in widgets" :key="widget.id" class="widget-item">
        <div class="widget-header">
          <span class="widget-label">
            <i
              :class="'ti ' + (getWidgetComponent(widget.type)?.icon ?? 'ti-puzzle')"
            />
            {{ getWidgetComponent(widget.type)?.label ?? widget.type }}
          </span>
          <button class="widget-remove" @click="removeWidget(widget.id)">
            <i class="ti ti-x" />
          </button>
        </div>
        <div class="widget-content">
          <component
            :is="getWidgetComponent(widget.type)?.component"
            :widget="widget"
            :column-id="column.id"
            :account-id="column.accountId"
          />
        </div>
      </div>

      <div class="add-widget-area">
        <button
          v-if="!showAddMenu"
          class="add-widget-btn"
          @click="showAddMenu = true"
        >
          <i class="ti ti-plus" /> Add Widget
        </button>
        <div v-else class="add-widget-menu">
          <button
            v-for="def in widgetDefinitions"
            :key="def.type"
            class="menu-item"
            @click="addWidget(def.type)"
          >
            <i :class="'ti ' + def.icon" />
            {{ def.label }}
          </button>
          <button class="menu-item cancel" @click="showAddMenu = false">
            Cancel
          </button>
        </div>
      </div>
    </div>
  </DeckColumn>
</template>

<style scoped>
.widget-column-body {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 10px;
  overflow-y: auto;
  flex: 1;
}

.widget-item {
  border: 1px solid var(--nd-divider);
  border-radius: 10px;
  background: var(--nd-panel);
  overflow: hidden;
}

.widget-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 10px;
  border-bottom: 1px solid var(--nd-divider);
  font-size: 0.85em;
}

.widget-label {
  display: flex;
  align-items: center;
  gap: 6px;
  font-weight: 500;
  opacity: 0.8;
}

.widget-remove {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border: none;
  background: none;
  color: var(--nd-fg);
  cursor: pointer;
  border-radius: 6px;
  opacity: 0.35;
  transition: opacity 0.15s, background 0.15s;
}

.widget-remove:hover {
  opacity: 1;
  color: var(--nd-love);
  background: rgba(221, 46, 68, 0.1);
}

.widget-content {
  padding: 10px;
}

.add-widget-area {
  display: flex;
  justify-content: center;
  padding: 6px;
}

.add-widget-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 7px 16px;
  border: 1px dashed var(--nd-divider);
  border-radius: 8px;
  background: none;
  color: var(--nd-fg);
  cursor: pointer;
  font-size: 0.85em;
  opacity: 0.5;
  transition: opacity 0.15s, border-color 0.15s;
}

.add-widget-btn:hover {
  opacity: 1;
  border-color: var(--nd-accent);
  color: var(--nd-accent);
}

.add-widget-menu {
  display: flex;
  flex-direction: column;
  gap: 4px;
  width: 100%;
}

.menu-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  border: none;
  border-radius: 6px;
  background: var(--nd-buttonBg);
  color: var(--nd-fg);
  cursor: pointer;
  font-size: 0.85em;
  text-align: left;
  transition: background 0.15s;
}

.menu-item:hover {
  background: var(--nd-buttonHoverBg);
}

.menu-item.cancel {
  justify-content: center;
  opacity: 0.5;
}
</style>
