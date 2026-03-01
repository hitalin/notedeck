<script setup lang="ts">
import { invoke } from '@tauri-apps/api/core'
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { DynamicScroller, DynamicScrollerItem } from 'vue-virtual-scroller'
import type { ChannelSubscription, NormalizedNote } from '@/adapters/types'
import MkNote from '@/components/common/MkNote.vue'
import MkPostForm from '@/components/common/MkPostForm.vue'
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

const router = useRouter()
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
  (note) => router.push(`/note/${note._accountId}/${note.id}`),
)
const { sync: syncCapture } = useNoteCapture(
  () => getAdapter()?.stream,
  onNoteUpdate,
)
setOnNotesChanged(syncCapture)
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
      if (newNotes.length > 0) setNotes([...newNotes, ...notes.value])
    } else if (fetched.length > 0) {
      setNotes(fetched)
    }

    mentionSub = adapter.stream.subscribeMentions(
      (note) => {
        if (noteIds.has(note.id)) return
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

function scrollToTop(smooth = false) {
  const el = scroller.value?.$el as HTMLElement | undefined
  if (el) el.scrollTo({ top: 0, behavior: smooth ? 'smooth' : 'instant' })
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

  try {
    const cached = await invoke<NormalizedNote[]>('api_get_cached_timeline', {
      accountId: props.column.accountId,
      timelineType: 'mentions',
      limit: 40,
    })
    if (cached.length > 0) {
      const newFromCache = cached.filter((n) => !noteIds.has(n.id))
      if (newFromCache.length > 0) {
        setNotes([...newFromCache, ...notes.value])
      }
    }
  } catch {
    /* non-critical */
  }

  const sinceId = notes.value[0]?.id
  if (!sinceId) return
  try {
    const fetched = await adapter.api.getMentions({ sinceId })
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
    :title="column.name || 'Mentions'"
    :theme-vars="columnThemeVars"
    @header-click="scrollToTop(true)"
  >
    <template #header-icon>
      <i class="ti ti-at tl-header-icon" />
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
      <div v-if="isLoading && notes.length === 0">
        <MkSkeleton v-for="i in 5" :key="i" />
      </div>

      <template v-else>
        <DynamicScroller
          ref="scroller"
          class="tl-scroller"
          :items="notes"
          :min-item-size="120"
          :buffer="400"
          key-field="id"
          @scroll.passive="handleScroll"
        >
          <template #default="{ item, active, index }">
            <DynamicScrollerItem
              :item="item"
              :active="active"
              :data-index="index"
            >
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
            </DynamicScrollerItem>
          </template>

          <template #after>
            <div v-if="isLoading && notes.length > 0" class="loading-more">
              Loading...
            </div>
          </template>
        </DynamicScroller>
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

<style src="./column-common.css" scoped></style>
