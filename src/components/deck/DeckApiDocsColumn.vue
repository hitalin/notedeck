<script setup lang="ts">
import { useColumnTheme } from '@/composables/useColumnTheme'
import type { DeckColumn as DeckColumnType } from '@/stores/deck'
import DeckColumn from './DeckColumn.vue'

const props = defineProps<{
  column: DeckColumnType
}>()

const { columnThemeVars } = useColumnTheme(() => props.column)
</script>

<template>
  <DeckColumn
    :column-id="column.id"
    :title="column.name ?? 'APIドキュメント'"
    :theme-vars="columnThemeVars"
  >
    <template #header-icon>
      <i class="ti ti-book tl-header-icon" />
    </template>

    <iframe
      class="docs-frame"
      src="http://127.0.0.1:19820/api/docs"
      title="API Documentation"
    />
  </DeckColumn>
</template>

<style scoped>
.docs-frame {
  flex: 1;
  width: 100%;
  border: none;
  min-height: 0;
}
</style>
