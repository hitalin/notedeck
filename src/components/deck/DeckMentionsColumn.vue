<script setup lang="ts">
import { invoke } from '@tauri-apps/api/core'
import {
  defineAsyncComponent,
  nextTick,
  onBeforeUnmount,
  onMounted,
  ref,
  watch,
} from 'vue'
import type { ChannelSubscription, NormalizedNote } from '@/adapters/types'
import MkNote from '@/components/common/MkNote.vue'
import NoteScroller from '@/components/common/NoteScroller.vue'
import { useNavigation } from '@/composables/useNavigation'
import { insertIntoSorted } from '@/utils/sortNotes'

const MkPostForm = defineAsyncComponent(
  () => import('@/components/common/MkPostForm.vue'),
)

import MkSkeleton from '@/components/common/MkSkeleton.vue'
import { useColumnSetup } from '@/composables/useColumnSetup'
import { useNoteCapture } from '@/composables/useNoteCapture'
import { useNoteFocus } from '@/composables/useNoteFocus'
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

const { navigateToNote } = useNavigation()
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
const { focusedNoteId } = useNoteFocus(
  props.column.id,
  notes,
  scroller,
  handlers,
  (note) => navigateToNote(note._accountId, note.id),
  props.column.accountId ?? undefined,
)
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

const animateEnter = ref(false)

let mentionSub: ChannelSubscription | null = null

async function connect(useCache = false) {
  error.value = null
  isLoading.value = true

  if (useCache && props.column.accountId) {
    try {
      const cached = await invoke<NormalizedNote[]>('api_get_cached_timeline', {
        accountId: props.column.accountId,
        timelineType: 'mentions',
        limit: 40,
      })
      if (cached.length > 0) setNotes(cached)
    } catch {
      /* non-critical */
    }
  }

  try {
    const adapter = await initAdapter()
    if (!adapter) return

    const sinceId = notes.value.length > 0 ? notes.value[0]?.id : undefined
    const fetched = await adapter.api.getMentions({
      ...(sinceId ? { sinceId } : {}),
    })
    if (sinceId && fetched.length > 0) {
      const newNotes = fetched.filter((n) => !noteIds.has(n.id))
      if (newNotes.length > 0) setNotes(insertIntoSorted(notes.value, newNotes))
    } else if (fetched.length > 0) {
      setNotes(fetched)
    }

    mentionSub = adapter.stream.subscribeMentions(
      (note) => {
        if (noteIds.has(note.id)) return
        animateEnter.value = true
        nextTick(() => {
          animateEnter.value = false
        })
        noteIds.add(note.id)
        notes.value = [note, ...notes.value]
        syncCapture(notes.value)
      },
      { onNoteUpdated: onNoteUpdate },
    )
  } catch (e) {
    if (notes.value.length === 0) {
      error.value = AppError.from(e)
    }
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
    })
    setNotes(insertIntoSorted(notes.value, older))
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

  // Run cache fetch and API fetch in parallel
  const cachePromise = props.column.accountId
    ? invoke<NormalizedNote[]>('api_get_cached_timeline', {
        accountId: props.column.accountId,
        timelineType: 'mentions',
        limit: 40,
      }).catch(() => [] as NormalizedNote[])
    : Promise.resolve([] as NormalizedNote[])

  const apiPromise = sinceId
    ? adapter.api.getMentions({ sinceId }).catch(() => [] as NormalizedNote[])
    : Promise.resolve([] as NormalizedNote[])

  const [cached, fetched] = await Promise.all([cachePromise, apiPromise])

  // Merge results: API results take priority, then cache
  const allNew = [...fetched, ...cached].filter((n) => !noteIds.has(n.id))
  if (allNew.length > 0) {
    const seen = new Set<string>()
    const deduped = allNew.filter((n) => {
      if (seen.has(n.id)) return false
      seen.add(n.id)
      return true
    })
    setNotes(insertIntoSorted(notes.value, deduped))
  }
}

onMounted(() => {
  window.addEventListener('deck-resume', onResume)
  connect(true)
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
    :title="column.name || 'あなた宛て'"
    :theme-vars="columnThemeVars"
    @header-click="scrollToTop()"
  >
    <template #header-icon>
      <i :class="$style.tlHeaderIcon" class="ti ti-at" />
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
        <NoteScroller ref="noteScrollerRef" :items="notes" :focused-id="focusedNoteId" :animate="animateEnter" :class="$style.tlScroller" @scroll="handleScroll">
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
</style>
