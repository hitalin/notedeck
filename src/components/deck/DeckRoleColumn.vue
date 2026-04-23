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
    adapter.api.getRoleNotes(props.column.roleId!, opts),
  validate: () => !!props.column.roleId,
  cache: {
    getKey: () => (props.column.roleId ? `role:${props.column.roleId}` : null),
  },
  streaming: {
    subscribe: (adapter, enqueue, callbacks) =>
      adapter.stream.subscribeRole(
        // biome-ignore lint/style/noNonNullAssertion: guarded by validate
        props.column.roleId!,
        enqueue,
        callbacks,
      ),
  },
}
</script>

<template>
  <DeckNoteColumn
    :column="column"
    title="ロール"
    icon="ti-badge"
    :web-ui-path="column.roleId ? `/roles/${column.roleId}` : undefined"
    sound-enabled
    :note-column-config="noteColumnConfig"
  />
</template>
