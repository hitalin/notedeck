<script setup lang="ts">
import { computed } from 'vue'
import AvatarStack from '@/components/common/AvatarStack.vue'
import LoadingSpinner from '@/components/common/LoadingSpinner.vue'
import MkNote from '@/components/common/MkNote.vue'
import NoteScroller from '@/components/common/NoteScroller.vue'
import { useColumnSetup } from '@/composables/useColumnSetup'
import { useCrossAccountNotes } from '@/composables/useCrossAccountNotes'
import type { NoteColumnConfig } from '@/composables/useNoteColumn'
import type { DeckColumn as DeckColumnType } from '@/stores/deck'
import DeckColumn from './DeckColumn.vue'
import DeckNoteColumn from './DeckNoteColumn.vue'

const props = defineProps<{
  column: DeckColumnType
}>()

const isCrossAccount = computed(() => props.column.accountId == null)

// Single-account config
const noteColumnConfig: NoteColumnConfig = {
  getColumn: () => props.column,
  fetch: (adapter, opts) =>
    adapter.api.getMentions({ ...opts, visibility: 'specified' }),
  cache: { getKey: () => 'specified' },
  streaming: {
    subscribe: (adapter, enqueue, callbacks) =>
      adapter.stream.subscribeMentions((note) => {
        if (note.visibility === 'specified') enqueue(note)
      }, callbacks),
  },
}

// Cross-account state
const {
  columnThemeVars,
  isLoading,
  error,
  handlers,
  scroller,
  onScrollReport,
} = useColumnSetup(() => props.column)

const {
  notes,
  noteScrollerRef,
  scrollToTop,
  connectCrossAccount,
  loadMoreCrossAccount,
  handleScroll,
  removeNote,
} = useCrossAccountNotes({
  fetchNotes: (adapter, opts) =>
    adapter.api.getMentions({ ...opts, visibility: 'specified' }),
  isCrossAccount: () => isCrossAccount.value,
  isLoading,
  error,
  scroller,
  onScrollReport,
})
</script>

<template>
  <!-- Cross-account mode -->
  <DeckColumn
    v-if="isCrossAccount"
    :column-id="column.id"
    :title="column.name || 'ダイレクト'"
    :theme-vars="columnThemeVars"
    refreshable
    :refreshing="isLoading"
    @header-click="scrollToTop"
    @refresh="connectCrossAccount"
  >
    <template #header-icon>
      <i class="ti ti-mail" :class="$style.tlHeaderIcon" />
    </template>

    <template #header-meta>
      <AvatarStack :size="20" />
    </template>

    <div v-if="error" :class="[$style.columnEmpty, $style.columnError]">
      {{ error.message }}
    </div>

    <div v-else :class="$style.tlBody">
      <div v-if="notes.length === 0 && !isLoading" :class="$style.columnEmpty">
        ダイレクトメッセージはありません
      </div>

      <NoteScroller
        v-else
        ref="noteScrollerRef"
        :items="notes"
        :class="$style.tlScroller"
        @scroll="handleScroll"
        @near-end="loadMoreCrossAccount"
      >
        <template #default="{ item }">
          <div>
            <MkNote
              :note="item"
              @react="handlers.reaction"
              @reply="handlers.reply"
              @renote="handlers.renote"
              @quote="handlers.quote"
              @delete="removeNote"
              @edit="handlers.edit"
              @bookmark="handlers.bookmark"
              @delete-and-edit="handlers.deleteAndEdit"
            />
          </div>
        </template>

        <template #append>
          <div v-if="isLoading && notes.length > 0" :class="$style.loadingMore">
            <LoadingSpinner />
          </div>
        </template>
      </NoteScroller>
    </div>
  </DeckColumn>

  <!-- Single-account mode -->
  <DeckNoteColumn
    v-else
    :column="column"
    title="ダイレクト"
    icon="ti-mail"
    sound-enabled
    :note-column-config="noteColumnConfig"
  />
</template>

<style lang="scss" module>
@use './column-common.module.scss';
</style>
