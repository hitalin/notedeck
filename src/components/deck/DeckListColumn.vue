<script setup lang="ts">
import { useEntityCrud } from '@/composables/useEntityCrud'
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

const { rename, deleteEntity, config } = useEntityCrud(
  'list',
  () => props.column,
)
</script>

<template>
  <DeckNoteColumn
    :column="column"
    title="リスト"
    icon="ti-list"
    :web-ui-path="column.listId ? `/my/lists/${column.listId}` : undefined"
    sound-enabled
    :note-column-config="noteColumnConfig"
  >
    <template #menu-items="{ closeMenu }">
      <button class="_popupItem" @click="rename(closeMenu)">
        <i class="ti ti-edit" />
        <span>名前を変更</span>
      </button>
      <button class="_popupItem" style="color: var(--nd-love, #ff6b6b);" @click="deleteEntity(closeMenu)">
        <i class="ti ti-trash" style="opacity: 1;" />
        <span>{{ config.label }}を削除</span>
      </button>
    </template>
  </DeckNoteColumn>
</template>
