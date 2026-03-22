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
    adapter.api.getMentions({ ...opts, visibility: 'specified' }),
  cache: {
    getKey: () => 'specified',
  },
  streaming: {
    subscribe: (adapter, enqueue, callbacks) =>
      adapter.stream.subscribeMentions((note) => {
        if (note.visibility === 'specified') enqueue(note)
      }, callbacks),
  },
}
</script>

<template>
  <DeckNoteColumn
    :column="column"
    title="ダイレクト"
    icon="ti-mail"
    sound-enabled
    :note-column-config="noteColumnConfig"
  />
</template>
