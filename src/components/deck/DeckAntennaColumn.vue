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
    adapter.api.getAntennaNotes(props.column.antennaId!, opts),
  validate: () => !!props.column.antennaId,
  cache: {
    getKey: () =>
      props.column.antennaId ? `antenna:${props.column.antennaId}` : null,
  },
  streaming: {
    subscribe: (adapter, enqueue, callbacks) =>
      adapter.stream.subscribeAntenna(
        // biome-ignore lint/style/noNonNullAssertion: guarded by validate
        props.column.antennaId!,
        enqueue,
        callbacks,
      ),
  },
}
</script>

<template>
  <DeckNoteColumn
    :column="column"
    title="アンテナ"
    icon="ti-antenna-bars-5"
    :web-ui-path="column.antennaId ? `/my/antennas/${column.antennaId}` : undefined"
    sound-enabled
    :note-column-config="noteColumnConfig"
  />
</template>
