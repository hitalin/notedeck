<script setup lang="ts">
import type { NoteColumnConfig } from '@/composables/useNoteColumn'
import type { DeckColumn as DeckColumnType } from '@/stores/deck'
import DeckNoteColumn from './DeckNoteColumn.vue'

const props = defineProps<{
  column: DeckColumnType
}>()

const noteColumnConfig: NoteColumnConfig = {
  getColumn: () => props.column,
  fetch: (adapter, opts) =>
    // biome-ignore lint/style/noNonNullAssertion: guarded by validate
    adapter.api.getClipNotes(props.column.clipId!, opts),
  validate: () => !!props.column.clipId,
  cache: {
    getKey: () => (props.column.clipId ? `clip:${props.column.clipId}` : null),
  },
}
</script>

<template>
  <DeckNoteColumn
    :column="column"
    title="クリップ"
    icon="ti-paperclip"
    :note-column-config="noteColumnConfig"
  />
</template>
