<script setup lang="ts">
import { defineAsyncComponent } from 'vue'
import type { DeckColumn } from '@/stores/deck'
import DeckColumnComponent from './DeckColumn.vue'

const PluginsContent = defineAsyncComponent(
  () => import('@/components/window/PluginsContent.vue'),
)

const props = defineProps<{
  column: DeckColumn
}>()
</script>

<template>
  <DeckColumnComponent :column-id="props.column.id" :title="props.column.name || 'プラグイン'">
    <template #header-icon>
      <i class="ti ti-plug" />
    </template>
    <div :class="$style.body">
      <PluginsContent />
    </div>
  </DeckColumnComponent>
</template>

<style lang="scss" module>
.body {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  scrollbar-color: var(--nd-scrollbarHandle) transparent;
  scrollbar-width: thin;
}
</style>
