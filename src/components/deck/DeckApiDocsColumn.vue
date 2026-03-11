<script setup lang="ts">
import { computed } from 'vue'
import { useColumnTheme } from '@/composables/useColumnTheme'
import type { DeckColumn as DeckColumnType } from '@/stores/deck'
import { useThemeStore } from '@/stores/theme'
import DeckColumn from './DeckColumn.vue'

const props = defineProps<{
  column: DeckColumnType
}>()

const { columnThemeVars } = useColumnTheme(() => props.column)
const themeStore = useThemeStore()

const iframeSrc = computed(() => {
  const isDark = !themeStore.currentSource?.kind.includes('light')
  return `http://127.0.0.1:19820/api/docs#${isDark ? 'dark' : 'light'}`
})
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
      :src="iframeSrc"
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
