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
    adapter.api.getTimeline('user-list', {
      ...opts,
      ...(props.column.listId ? { listId: props.column.listId } : {}),
    }),
  cache: {
    getKey: () =>
      props.column.listId ? `user-list:${props.column.listId}` : null,
  },
  streaming: {
    subscribe: (adapter, enqueue, callbacks) =>
      adapter.stream.subscribeTimeline('user-list', enqueue, {
        ...callbacks,
        listId: props.column.listId,
      }),
  },
}
</script>

<template>
  <DeckNoteColumn
    :column="column"
    title="リスト"
    icon="ti-list"
    :web-ui-path="column.listId ? `/my/lists/${column.listId}` : undefined"
    sound-enabled
    :note-column-config="noteColumnConfig"
  />
</template>
