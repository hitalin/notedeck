<script setup lang="ts">
import type { NoteColumnConfig } from '@/composables/useNoteColumn'
import type { DeckColumn as DeckColumnType } from '@/stores/deck'
import DeckNoteColumn from './DeckNoteColumn.vue'

const props = defineProps<{
  column: DeckColumnType
}>()

const noteColumnConfig: NoteColumnConfig = {
  getColumn: () => props.column,
  fetch: (adapter, opts) => adapter.api.getMentions(opts),
  cache: {
    getKey: () => 'mentions',
  },
  streaming: {
    subscribe: (adapter, enqueue, callbacks) =>
      adapter.stream.subscribeMentions(enqueue, callbacks),
  },
}
</script>

<template>
  <DeckNoteColumn
    :column="column"
    title="あなた宛て"
    icon="ti-at"
    sound-enabled
    :note-column-config="noteColumnConfig"
  />
</template>
