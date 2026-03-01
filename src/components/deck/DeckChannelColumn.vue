<script setup lang="ts">
import { onMounted, onUnmounted, ref, shallowRef } from 'vue'
import { useRouter } from 'vue-router'
import { invoke } from '@tauri-apps/api/core'
import { DynamicScroller, DynamicScrollerItem } from 'vue-virtual-scroller'
import type { NormalizedNote, NoteUpdateEvent } from '@/adapters/types'
import MkNote from '@/components/common/MkNote.vue'
import MkPostForm from '@/components/common/MkPostForm.vue'
import MkSkeleton from '@/components/common/MkSkeleton.vue'
import { useColumnSetup } from '@/composables/useColumnSetup'
import { useNoteFocus } from '@/composables/useNoteFocus'
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
} = useColumnSetup(() => props.column)

const router = useRouter()

const MAX_NOTES = 500
const notes = shallowRef<NormalizedNote[]>([])
const pendingNotes = shallowRef<NormalizedNote[]>([])
const isAtTop = ref(true)

const { focusedNoteId } = useNoteFocus(
  props.column.id,
  notes,
  scroller,
  handlers,
  (note) => router.push(`/note/${note._accountId}/${note.id}`),
)

// rAF batching for streaming notes
let rafBuffer: NormalizedNote[] = []
let rafId: number | null = null

function flushRafBuffer() {
  rafId = null
  if (rafBuffer.length === 0) return
  const batch = rafBuffer
  rafBuffer = []
  if (isAtTop.value) {
    for (const n of batch) noteIds.add(n.id)
    const merged = [...batch, ...notes.value]
    notes.value =
      merged.length > MAX_NOTES ? merged.slice(0, MAX_NOTES) : merged
  } else {
    const merged = [...batch, ...pendingNotes.value]
    pendingNotes.value =
      merged.length > MAX_NOTES ? merged.slice(0, MAX_NOTES) : merged
  }
}

// Maintain ID set alongside notes array for O(1) dedup
const noteIds = new Set<string>()

function setNotes(newNotes: NormalizedNote[]) {
  notes.value = newNotes
  noteIds.clear()
  for (const n of newNotes) noteIds.add(n.id)
}

function flushPending() {
  if (pendingNotes.value.length === 0) return
  const newNotes = pendingNotes.value.filter((n) => !noteIds.has(n.id))
  if (newNotes.length === 0) {
    pendingNotes.value = []
    return
  }
  for (const n of newNotes) noteIds.add(n.id)
  const merged = [...newNotes, ...notes.value]
  notes.value = merged.length > MAX_NOTES ? merged.slice(0, MAX_NOTES) : merged
  pendingNotes.value = []
}

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
        (note: NormalizedNote) => {
          rafBuffer.push(note)
          if (rafId === null) {
            rafId = requestAnimationFrame(flushRafBuffer)
          }
        },
        { onNoteUpdated: applyNoteUpdate },
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

function applyNoteUpdate(event: NoteUpdateEvent) {
  switch (event.type) {
    case 'reacted': {
      const reaction = event.body.reaction
      if (!reaction) break
      notes.value = notes.value.map((n) => {
        const target =
          n.id === event.noteId
            ? n
            : n.renoteId === event.noteId
              ? n.renote
              : null
        if (!target) return n
        const newReactions = {
          ...target.reactions,
          [reaction]: (target.reactions[reaction] ?? 0) + 1,
        }
        const newEmojis = event.body.emoji
          ? { ...target.reactionEmojis, [reaction]: event.body.emoji }
          : target.reactionEmojis
        const updated = {
          ...target,
          reactions: newReactions,
          reactionEmojis: newEmojis,
        }
        return n.id === event.noteId ? updated : { ...n, renote: updated }
      })
      break
    }
    case 'unreacted': {
      const reaction = event.body.reaction
      if (!reaction) break
      notes.value = notes.value.map((n) => {
        const target =
          n.id === event.noteId
            ? n
            : n.renoteId === event.noteId
              ? n.renote
              : null
        if (!target) return n
        const newReactions = { ...target.reactions }
        const count = (newReactions[reaction] ?? 0) - 1
        if (count <= 0) delete newReactions[reaction]
        else newReactions[reaction] = count
        const updated = { ...target, reactions: newReactions }
        return n.id === event.noteId ? updated : { ...n, renote: updated }
      })
      break
    }
    case 'deleted':
      notes.value = notes.value.filter(
        (n) => n.id !== event.noteId && n.renoteId !== event.noteId,
      )
      noteIds.delete(event.noteId)
      break
    case 'pollVoted': {
      const choice = event.body.choice
      if (choice == null) break
      notes.value = notes.value.map((n) => {
        const target =
          n.id === event.noteId
            ? n
            : n.renoteId === event.noteId
              ? n.renote
              : null
        if (!target?.poll) return n
        const newChoices = target.poll.choices.map((c, i) =>
          i === choice ? { ...c, votes: c.votes + 1 } : c,
        )
        const updated = {
          ...target,
          poll: { ...target.poll, choices: newChoices },
        }
        return n.id === event.noteId ? updated : { ...n, renote: updated }
      })
      break
    }
  }
}

async function handlePosted(editedNoteId?: string) {
  postForm.close()
  if (editedNoteId) {
    const adapter = getAdapter()
    if (!adapter) return
    try {
      const updated = await adapter.api.getNote(editedNoteId)
      notes.value = notes.value.map((n) =>
        n.id === editedNoteId
          ? updated
          : n.renoteId === editedNoteId
            ? { ...n, renote: updated }
            : n,
      )
    } catch {
      // note may have been deleted
    }
  }
}

async function removeNote(note: NormalizedNote) {
  if (await handlers.delete(note)) {
    const id = note.id
    notes.value = notes.value.filter((n) => n.id !== id && n.renoteId !== id)
    noteIds.delete(id)
  }
}

function scrollToTop(smooth = false) {
  const el = scroller.value?.$el as HTMLElement | undefined
  if (el) el.scrollTo({ top: 0, behavior: smooth ? 'smooth' : 'instant' })
  isAtTop.value = true
  flushPending()
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
  const el = scroller.value?.$el as HTMLElement | undefined
  if (el) {
    isAtTop.value = el.scrollTop <= 10
    if (isAtTop.value && pendingNotes.value.length > 0) {
      flushPending()
    }
  }
  onScroll(loadMore)
}

onMounted(() => {
  connect(true)
})

onUnmounted(() => {
  disconnect()
  if (rafId !== null) {
    cancelAnimationFrame(rafId)
    rafId = null
  }
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
