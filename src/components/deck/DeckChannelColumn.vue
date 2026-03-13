<script setup lang="ts">
import { computed, defineAsyncComponent } from 'vue'
import MkNote from '@/components/common/MkNote.vue'
import NoteScroller from '@/components/common/NoteScroller.vue'

const MkPostForm = defineAsyncComponent(
  () => import('@/components/common/MkPostForm.vue'),
)

import MkSkeleton from '@/components/common/MkSkeleton.vue'
import { useNoteColumn } from '@/composables/useNoteColumn'
import type { DeckColumn as DeckColumnType } from '@/stores/deck'
import DeckColumn from './DeckColumn.vue'

const props = defineProps<{
  column: DeckColumnType
}>()

const {
  account,
  columnThemeVars,
  serverIconUrl,
  isLoading,
  error,
  notes,
  focusedNoteId,
  pendingNotes,
  postForm,
  handlers,
  noteScrollerRef,
  scrollToTop,
  handleScroll,
  handlePosted,
  removeNote,
  pullDistance,
  isRefreshing,
} = useNoteColumn({
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
    subscribe: (adapter, enqueue, callbacks) =>
      adapter.stream.subscribeChannel(
        // biome-ignore lint/style/noNonNullAssertion: guarded by validate
        props.column.channelId!,
        enqueue,
        callbacks,
      ),
  },
})

const webUiUrl = computed(() =>
  account.value && props.column.channelId
    ? `https://${account.value.host}/channels/${props.column.channelId}`
    : undefined,
)
</script>

<template>
  <DeckColumn
    :column-id="column.id"
    :title="column.name || 'チャンネル'"
    :theme-vars="columnThemeVars"
    :web-ui-url="webUiUrl"
    sound-enabled
    @header-click="scrollToTop()"
  >
    <template #header-icon>
      <i class="ti ti-device-tv tl-header-icon" />
    </template>

    <template #header-meta>
      <div v-if="account" class="header-account">
        <img v-if="account.avatarUrl" :src="account.avatarUrl" class="header-avatar" />
        <img class="header-favicon" :src="serverIconUrl || `https://${account.host}/favicon.ico`" :title="account.host" />
      </div>
    </template>

    <div v-if="!account" class="column-empty">
      Account not found
    </div>

    <div v-else-if="error" class="column-empty column-error">
      {{ error.message }}
    </div>

    <div v-else class="tl-body">
      <div
        v-if="pullDistance > 0 || isRefreshing"
        class="pull-indicator"
        :style="{ height: pullDistance + 'px' }"
      >
        <i class="ti" :class="isRefreshing ? 'ti-loader-2 spin' : 'ti-arrow-down'" :style="{ opacity: Math.min(pullDistance / 64, 1), transform: pullDistance >= 64 && !isRefreshing ? 'rotate(180deg)' : '' }" />
      </div>
      <!-- Inline post form -->
      <MkPostForm
        v-if="column.channelId && column.accountId"
        :account-id="column.accountId"
        :channel-id="column.channelId"
        inline
        @posted="handlePosted"
      />

      <div v-if="isLoading && notes.length === 0">
        <MkSkeleton v-for="i in 5" :key="i" />
      </div>

      <template v-else>
        <button
          v-if="pendingNotes.length > 0"
          class="new-notes-banner _button"
          @click="scrollToTop()"
        >
          <i class="ti ti-arrow-up" />{{ pendingNotes.length }}件の新しいノート
        </button>

        <NoteScroller ref="noteScrollerRef" :items="notes" class="tl-scroller" @scroll="handleScroll">
          <template #default="{ item, index }">
            <div :data-index="index">
              <MkNote
                :note="item"
                :focused="item.id === focusedNoteId"
                @react="handlers.reaction"
                @reply="handlers.reply"
                @renote="handlers.renote"
                @quote="handlers.quote"
                @delete="removeNote"
                @edit="handlers.edit"
                @bookmark="handlers.bookmark"
              />
            </div>
          </template>

          <template #append>
            <div v-if="isLoading && notes.length > 0" class="loading-more">
              Loading...
            </div>
          </template>
        </NoteScroller>
      </template>
    </div>
  </DeckColumn>

  <Teleport to="body">
    <MkPostForm
      v-if="postForm.show.value && column.accountId"
      :account-id="column.accountId"
      :reply-to="postForm.replyTo.value"
      :renote-id="postForm.renoteId.value"
      :edit-note="postForm.editNote.value"
      :channel-id="column.channelId"
      @close="postForm.close"
      @posted="handlePosted"
    />
  </Teleport>
</template>

<style scoped>
@import "./column-common.css";

.pull-indicator {
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  flex-shrink: 0;
  color: var(--nd-accent);
  font-size: 1.2em;
  transition: height var(--nd-duration-slow) ease;
}

.pull-indicator .ti {
  transition: transform var(--nd-duration-slow) ease, opacity var(--nd-duration-slow) ease;
}
</style>
