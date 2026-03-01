<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { DynamicScroller, DynamicScrollerItem } from 'vue-virtual-scroller'
import type {
  ChannelSubscription,
  NormalizedNote,
} from '@/adapters/types'
import MkNote from '@/components/common/MkNote.vue'
import MkPostForm from '@/components/common/MkPostForm.vue'
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
  setOnNotesMutated,
} = useColumnSetup(() => props.column)

const { notes, noteIds, setNotes, setOnNotesChanged, onNoteUpdate, handlePosted, removeNote } = useNoteList({
  getMyUserId: () => account.value?.userId,
  getAdapter,
  deleteHandler: handlers.delete,
  closePostForm: postForm.close,
})
setOnNotesMutated(() => { notes.value = [...notes.value] })
const { sync: syncCapture } = useNoteCapture(() => getAdapter()?.stream, onNoteUpdate)
setOnNotesChanged(syncCapture)
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

    mentionSub = adapter.stream.subscribeMentions((note) => {
      if (note.visibility !== 'specified') return
      if (noteIds.has(note.id)) return
      noteIds.add(note.id)
      notes.value = [note, ...notes.value]
      syncCapture(notes.value)
    }, { onNoteUpdated: onNoteUpdate })
  } catch (e) {
    error.value = AppError.from(e)
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
    const fetched = await adapter.api.getMentions({ sinceId, visibility: 'specified' })
    const newFromApi = fetched.filter((n) => !noteIds.has(n.id))
    if (newFromApi.length > 0) {
      setNotes([...newFromApi, ...notes.value])
    }
  } catch { /* non-critical */ }
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
    :title="column.name || 'Direct'"
    :theme-vars="columnThemeVars"
    @header-click="scrollToTop(true)"
  >
    <template #header-icon>
      <i class="ti ti-mail tl-header-icon" />
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

<style scoped>
.tl-header-icon {
  flex-shrink: 0;
  opacity: 0.7;
}

.header-account {
  display: flex;
  align-items: center;
  gap: 4px;
  flex-shrink: 0;
}

.header-avatar {
  width: 18px;
  height: 18px;
  border-radius: 50%;
  object-fit: cover;
}

.header-favicon {
  width: 16px;
  height: 16px;
  object-fit: contain;
  opacity: 0.7;
}

.tl-body {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.tl-scroller {
  flex: 1;
  overflow-x: clip;
  scrollbar-color: var(--nd-scrollbarHandle) transparent;
  scrollbar-width: thin;
  will-change: scroll-position;
}

.tl-scroller :deep(.vue-recycle-scroller__item-view) {
  will-change: transform;
}

.column-empty {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 2rem 1rem;
  color: var(--nd-fg);
  opacity: 0.5;
  font-size: 0.85em;
}

.column-error {
  color: var(--nd-love);
  opacity: 1;
}

.loading-more {
  text-align: center;
  padding: 1rem;
  font-size: 0.8em;
  opacity: 0.4;
}
</style>
