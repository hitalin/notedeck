<script setup lang="ts">
import { defineAsyncComponent } from 'vue'
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
  postForm,
  handlers,
  noteScrollerRef,
  scrollToTop,
  handleScroll,
  handlePosted,
  removeNote,
  refresh,
  pullDistance,
  isRefreshing,
} = useNoteColumn({
  getColumn: () => props.column,
  fetch: (adapter, opts) =>
    // biome-ignore lint/style/noNonNullAssertion: guarded by validate
    adapter.api.getClipNotes(props.column.clipId!, opts),
  validate: () => !!props.column.clipId,
  cache: {
    getKey: () => (props.column.clipId ? `clip:${props.column.clipId}` : null),
  },
})
</script>

<template>
  <DeckColumn
    :column-id="column.id"
    :title="column.name || 'クリップ'"
    :theme-vars="columnThemeVars"
    @header-click="scrollToTop()"
  >
    <template #header-icon>
      <i :class="$style.tlHeaderIcon" class="ti ti-paperclip" />
    </template>

    <template #header-meta>
      <button :class="$style.headerRefresh" class="_button" title="Refresh" :disabled="isLoading" @click.stop="refresh">
        <i class="ti ti-refresh" :class="{ [String($style.spin)]: isLoading }" />
      </button>
      <div v-if="account" :class="$style.headerAccount">
        <img v-if="account.avatarUrl" :src="account.avatarUrl" :class="$style.headerAvatar" />
        <img :class="$style.headerFavicon" :src="serverIconUrl || `https://${account.host}/favicon.ico`" :title="account.host" />
      </div>
    </template>

    <div v-if="!account" :class="$style.columnEmpty">
      Account not found
    </div>

    <div v-else-if="error" :class="[$style.columnEmpty, $style.columnError]">
      {{ error.message }}
    </div>

    <div v-else :class="$style.tlBody">
      <div
        v-if="pullDistance > 0 || isRefreshing"
        :class="$style.pullIndicator"
        :style="{ height: pullDistance + 'px' }"
      >
        <i class="ti" :class="[isRefreshing ? 'ti-loader-2' : 'ti-arrow-down', { [String($style.spin)]: isRefreshing }]" :style="{ opacity: Math.min(pullDistance / 64, 1), transform: pullDistance >= 64 && !isRefreshing ? 'rotate(180deg)' : '' }" />
      </div>
      <div v-if="isLoading && notes.length === 0">
        <MkSkeleton v-for="i in 5" :key="i" />
      </div>

      <template v-else>
        <NoteScroller ref="noteScrollerRef" :items="notes" :focused-id="focusedNoteId" :class="$style.tlScroller" @scroll="handleScroll">
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
            <div v-if="isLoading && notes.length > 0" :class="$style.loadingMore">
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
      @close="postForm.close"
      @posted="handlePosted"
    />
  </Teleport>
</template>

<style lang="scss" module>
@use "./column-common.module.scss";

.pullIndicator {
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  flex-shrink: 0;
  color: var(--nd-accent);
  font-size: 1.2em;
  transition: height var(--nd-duration-slow) ease;

  :global(.ti) {
    transition: transform var(--nd-duration-slow) ease, opacity var(--nd-duration-slow) ease;
  }
}
</style>
