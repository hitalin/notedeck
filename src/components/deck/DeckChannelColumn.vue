<script setup lang="ts">
import { onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import { invoke } from '@tauri-apps/api/core'
import { DynamicScroller, DynamicScrollerItem } from 'vue-virtual-scroller'
import type { NormalizedNote } from '@/adapters/types'
import MkNote from '@/components/common/MkNote.vue'
import MkPostForm from '@/components/common/MkPostForm.vue'
import MkSkeleton from '@/components/common/MkSkeleton.vue'
import { useColumnSetup } from '@/composables/useColumnSetup'
import { useNoteFocus } from '@/composables/useNoteFocus'
import { useNoteList } from '@/composables/useNoteList'
import { useStreamingBatch } from '@/composables/useStreamingBatch'
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
  setSubscription,
  disconnect,
  postForm,
  handlers,
  scroller,
  onScroll,
  setOnNotesMutated,
} = useColumnSetup(() => props.column)

const router = useRouter()
const { notes, noteIds, setNotes, onNoteUpdate, handlePosted, removeNote } = useNoteList({
  getMyUserId: () => account.value?.userId,
  getAdapter,
  deleteHandler: handlers.delete,
  closePostForm: postForm.close,
})
setOnNotesMutated(() => { notes.value = [...notes.value] })

const { pendingNotes, enqueueNote, handleScroll: batchHandleScroll, scrollToTop, resetBatch } = useStreamingBatch({
  notes,
  noteIds,
  scroller,
})

const { focusedNoteId } = useNoteFocus(
  props.column.id,
  notes,
  scroller,
  handlers,
  (note) => router.push(`/note/${note._accountId}/${note.id}`),
)

async function connect(useCache = false) {
  error.value = null
  isLoading.value = true

  const channelId = props.column.channelId
  if (!channelId) {
    isLoading.value = false
    return
  }

  if (useCache && props.column.accountId) {
    try {
      const cached = await invoke<NormalizedNote[]>('api_get_cached_timeline', {
        accountId: props.column.accountId,
        timelineType: `channel:${channelId}`,
        limit: 40,
      })
      if (cached.length > 0) setNotes(cached)
    } catch { /* non-critical */ }
  }

  try {
    const adapter = await initAdapter()
    if (!adapter) return

    const sinceId = notes.value.length > 0 ? notes.value[0]?.id : undefined
    const fetched = await adapter.api.getChannelNotes(channelId, {
      ...(sinceId ? { sinceId } : {}),
    })
    if (sinceId && fetched.length > 0) {
      const newNotes = fetched.filter((n) => !noteIds.has(n.id))
      if (newNotes.length > 0) setNotes([...newNotes, ...notes.value])
    } else if (fetched.length > 0) {
      setNotes(fetched)
    }

    adapter.stream.connect()
    setSubscription(
      adapter.stream.subscribeChannel(
        channelId,
        enqueueNote,
        { onNoteUpdated: onNoteUpdate },
      ),
    )
  } catch (e) {
    if (notes.value.length === 0) {
      error.value = AppError.from(e)
    }
  } finally {
    isLoading.value = false
  }
}

async function loadMore() {
  const adapter = getAdapter()
  if (!adapter || isLoading.value || notes.value.length === 0) return
  const lastNote = notes.value.at(-1)
  if (!lastNote) return
  const channelId = props.column.channelId
  if (!channelId) return
  isLoading.value = true
  try {
    const older = await adapter.api.getChannelNotes(channelId, {
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
  batchHandleScroll()
  onScroll(loadMore)
}

let lastResumeAt = 0

async function onResume() {
  const now = Date.now()
  if (now - lastResumeAt < 3000) return
  lastResumeAt = now

  const adapter = getAdapter()
  const channelId = props.column.channelId
  if (!adapter || !account.value || !channelId) return

  try {
    const cached = await invoke<NormalizedNote[]>('api_get_cached_timeline', {
      accountId: props.column.accountId,
      timelineType: `channel:${channelId}`,
      limit: 40,
    })
    if (cached.length > 0) {
      const newFromCache = cached.filter((n) => !noteIds.has(n.id))
      if (newFromCache.length > 0) {
        setNotes([...newFromCache, ...notes.value])
      }
    }
  } catch { /* non-critical */ }

  const sinceId = notes.value[0]?.id
  if (!sinceId) return
  try {
    const fetched = await adapter.api.getChannelNotes(channelId, { sinceId })
    const newFromApi = fetched.filter((n) => !noteIds.has(n.id))
    if (newFromApi.length > 0) {
      setNotes([...newFromApi, ...notes.value])
    }
  } catch { /* non-critical */ }
}

onMounted(() => {
  window.addEventListener('deck-resume', onResume)
  connect(true)
})

onUnmounted(() => {
  window.removeEventListener('deck-resume', onResume)
  disconnect()
  resetBatch()
})
</script>

<template>
  <DeckColumn
    :column-id="column.id"
    :title="column.name || 'Channel'"
    :theme-vars="columnThemeVars"
    @header-click="scrollToTop(true)"
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
      <div v-if="isLoading && notes.length === 0">
        <MkSkeleton v-for="i in 5" :key="i" />
      </div>

      <template v-else>
        <button
          v-if="pendingNotes.length > 0"
          class="new-notes-banner _button"
          @click="scrollToTop()"
        >
          {{ pendingNotes.length }} new notes
        </button>

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

.new-notes-banner {
  display: block;
  width: 100%;
  padding: 8px 0;
  text-align: center;
  font-size: 0.85em;
  font-weight: bold;
  color: var(--nd-accent);
  background: var(--nd-accentedBg);
  border-bottom: 1px solid var(--nd-divider);
  cursor: pointer;
  flex-shrink: 0;
  transition: background 0.15s;
  animation: slide-down 0.3s ease;
}

@keyframes slide-down {
  from { transform: translateY(-100%); opacity: 0; }
  to { transform: translateY(0); opacity: 1; }
}

.new-notes-banner:hover {
  background: var(--nd-buttonHoverBg);
}

.loading-more {
  text-align: center;
  padding: 1rem;
  font-size: 0.8em;
  opacity: 0.4;
}
</style>
