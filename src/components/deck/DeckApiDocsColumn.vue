<script setup lang="ts">
import { ApiReference } from '@scalar/api-reference'
import { computed, onMounted, ref } from 'vue'
import '@scalar/api-reference/style.css'
import { useColumnTheme } from '@/composables/useColumnTheme'
import type { DeckColumn as DeckColumnType } from '@/stores/deck'
import { useThemeStore } from '@/stores/theme'
import DeckColumn from './DeckColumn.vue'

const props = defineProps<{
  column: DeckColumnType
}>()

const { columnThemeVars } = useColumnTheme(() => props.column)
const themeStore = useThemeStore()

const spec = ref<string | null>(null)
const error = ref<string | null>(null)

onMounted(async () => {
  try {
    const res = await fetch('http://127.0.0.1:19820/api/openapi.json')
    spec.value = await res.text()
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e)
  }
})

const isDark = computed(() => !themeStore.currentSource?.kind.includes('light'))

const config = computed(() => ({
  spec: { content: spec.value },
  forceDarkModeState: isDark.value ? 'dark' : 'light',
  hideDarkModeToggle: true,
  hideDownloadButton: true,
}))
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

    <div :class="$style.docsContainer">
      <div v-if="error" :class="$style.docsError">{{ error }}</div>
      <div v-else-if="!spec" :class="$style.docsLoading">読み込み中...</div>
      <ApiReference v-else :key="isDark ? 'dark' : 'light'" :configuration="config" />
    </div>
  </DeckColumn>
</template>

<style lang="scss" module>
.docsContainer {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
}

.docsError {
  padding: 16px;
  color: var(--nd-love);
  font-size: 0.85em;
}

.docsLoading {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  opacity: 0.4;
  font-size: 0.85em;
}
</style>
