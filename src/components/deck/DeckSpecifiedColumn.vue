<script setup lang="ts">
import {
  defineAsyncComponent,
  onBeforeUnmount,
  onMounted,
  ref,
  watch,
} from 'vue'
import type { ChannelSubscription, NormalizedNote } from '@/adapters/types'
import MkNote from '@/components/common/MkNote.vue'
import NoteScroller from '@/components/common/NoteScroller.vue'

const MkPostForm = defineAsyncComponent(
  () => import('@/components/common/MkPostForm.vue'),
)

import MkSkeleton from '@/components/common/MkSkeleton.vue'
import { useColumnSetup } from '@/composables/useColumnSetup'
import { useNoteCapture } from '@/composables/useNoteCapture'
import { useNoteList } from '@/composables/useNoteList'
import type { DeckColumn as DeckColumnType } from '@/stores/deck'
import { AppError } from '@/utils/errors'
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
  initAdapter,
  getAdapter,
  postForm,
  handlers,
  scroller,
  onScroll,
} = useColumnSetup(() => props.column)

const {
  notes,
  noteIds,
  setNotes,
  setOnNotesChanged,
  onNoteUpdate,
  handlePosted,
  removeNote,
} = useNoteList({
  getMyUserId: () => account.value?.userId,
  getAdapter,
  deleteHandler: handlers.delete,
  closePostForm: postForm.close,
})
const { sync: syncCapture } = useNoteCapture(
  () => getAdapter()?.stream,
  onNoteUpdate,
)
setOnNotesChanged(syncCapture)
const noteScrollerRef = ref<{ getElement: () => HTMLElement | null } | null>(
  null,
)
watch(
  noteScrollerRef,
  () => {
    scroller.value = noteScrollerRef.value?.getElement() ?? null
  },
  { flush: 'post' },
)

let mentionSub: ChannelSubscription | null = null

async function connect() {
  error.value = null
  isLoading.value = true

  try {
    const adapter = await initAdapter()
    if (!adapter) return

    const fetched = await adapter.api.getMentions({ visibility: 'specified' })
    if (fetched.length > 0) {
      setNotes(fetched)
    }

    mentionSub = adapter.stream.subscribeMentions(
      (note) => {
        if (note.visibility !== 'specified') return
        if (noteIds.has(note.id)) return
        noteIds.add(note.id)
        notes.value = [note, ...notes.value]
        syncCapture(notes.value)
      },
      { onNoteUpdated: onNoteUpdate },
    )
  } catch (e) {
    error.value = AppError.from(e)
  } finally {
    isLoading.value = false
  }
}

function scrollToTop() {
  if (scroller.value) scroller.value.scrollTop = 0
}

async function loadMore() {
  const adapter = getAdapter()
  if (!adapter || isLoading.value || notes.value.length === 0) return
  const lastNote = notes.value.at(-1)
  if (!lastNote) return
  isLoading.value = true
  try {
    const older = await adapter.api.getMentions({
      untilId: lastNote.id,
      visibility: 'specified',
    })
    setNotes([...notes.value, ...older])
  } catch (e) {
    error.value = AppError.from(e)
  } finally {
    isLoading.value = false
  }
}

function handleScroll() {
  onScroll(loadMore)
}

let lastResumeAt = 0

async function onResume() {
  const now = Date.now()
  if (now - lastResumeAt < 3000) return
  lastResumeAt = now

  const adapter = getAdapter()
  if (!adapter || !account.value) return

  const sinceId = notes.value[0]?.id
  if (!sinceId) return
  try {
    const fetched = await adapter.api.getMentions({
      sinceId,
      visibility: 'specified',
    })
    const newFromApi = fetched.filter((n) => !noteIds.has(n.id))
    if (newFromApi.length > 0) {
      setNotes([...newFromApi, ...notes.value])
    }
  } catch {
    /* non-critical */
  }
}

onMounted(() => {
  window.addEventListener('deck-resume', onResume)
  connect()
})

onBeforeUnmount(() => {
  window.removeEventListener('deck-resume', onResume)
  mentionSub?.dispose()
  mentionSub = null
})
</script>

<template>
  <DeckColumn
    :column-id="column.id"
    :title="column.name || 'ダイレクト'"
    :theme-vars="columnThemeVars"
    @header-click="scrollToTop()"
  >
    <template #header-icon>
      <i :class="$style.tlHeaderIcon" class="ti ti-mail" />
    </template>

    <template #header-meta>
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
      <div v-if="isLoading && notes.length === 0">
        <MkSkeleton v-for="i in 5" :key="i" />
      </div>

      <template v-else>
        <NoteScroller ref="noteScrollerRef" :items="notes" :class="$style.tlScroller" @scroll="handleScroll">
          <template #default="{ item, index }">
            <div :data-index="index">
              <MkNote
                :note="item"
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
</style>
