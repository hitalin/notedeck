<script setup lang="ts">
import { computed, defineAsyncComponent } from 'vue'
import { createQuerySubscription } from '@/adapters/misskey/query'
import type { NormalizedNote } from '@/adapters/types'
import type { NoteColumnConfig } from '@/composables/useNoteColumn'
import { useAccountsStore } from '@/stores/accounts'
import type { DeckColumn as DeckColumnType } from '@/stores/deck'
import { commands, unwrap } from '@/utils/tauriInvoke'
import DeckNoteColumn from './DeckNoteColumn.vue'

const MkPostForm = defineAsyncComponent(
  () => import('@/components/common/MkPostForm.vue'),
)

const props = defineProps<{
  column: DeckColumnType
}>()

const accountsStore = useAccountsStore()
const account = computed(() =>
  props.column.accountId
    ? accountsStore.accountMap.get(props.column.accountId)
    : null,
)

const noteColumnConfig: NoteColumnConfig = {
  getColumn: () => props.column,
  fetch: (adapter, opts) =>
    // biome-ignore lint/style/noNonNullAssertion: guarded by validate
    adapter.api.getChannelNotes(props.column.channelId!, opts),
  validate: () => !!props.column.channelId,
  cache: {
    getKey: () =>
      props.column.channelId ? `channel:${props.column.channelId}` : null,
  },
  streaming: {
    subscribe: (adapter, enqueue, callbacks) => {
      const accountId = props.column.accountId
      const channelId = props.column.channelId
      if (!accountId || !channelId) {
        return adapter.stream.subscribeChannel(
          // biome-ignore lint/style/noNonNullAssertion: guarded by validate
          channelId!,
          enqueue,
          callbacks,
        )
      }
      return createQuerySubscription({
        open: async () =>
          unwrap(await commands.querySubscribeChannel(accountId, channelId)),
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
    title="チャンネル"
    icon="ti-device-tv"
    :web-ui-path="column.channelId ? `/channels/${column.channelId}` : undefined"
    sound-enabled
    hide-channel-badge
    :note-column-config="noteColumnConfig"
  >
    <template #before-notes="{ handlePosted }">
      <MkPostForm
        v-if="column.channelId && column.accountId && account?.hasToken"
        :account-id="column.accountId"
        :channel-id="column.channelId"
        inline
        @posted="handlePosted"
      />
    </template>
  </DeckNoteColumn>
</template>
