<script setup lang="ts">
import { createQuerySubscription } from '@/adapters/misskey/query'
import type { NormalizedNote } from '@/adapters/types'
import type { NoteColumnConfig } from '@/composables/useNoteColumn'
import type { DeckColumn as DeckColumnType } from '@/stores/deck'
import { commands, unwrap } from '@/utils/tauriInvoke'
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
    subscribe: (adapter, enqueue, callbacks) => {
      const accountId = props.column.accountId
      const roleId = props.column.roleId
      if (!accountId || !roleId) {
        return adapter.stream.subscribeRole(
          // biome-ignore lint/style/noNonNullAssertion: guarded by validate
          roleId!,
          enqueue,
          callbacks,
        )
      }
      return createQuerySubscription({
        open: async () =>
          unwrap(await commands.querySubscribeRole(accountId, roleId)),
        onInsert: (item) => enqueue(item as unknown as NormalizedNote),
        onDelete: (id) =>
          callbacks.onNoteUpdated?.({
            noteId: id,
            type: 'deleted',
            body: {},
          }),
        onUpdate: (event) => callbacks.onNoteUpdated?.(event),
      })
    },
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
