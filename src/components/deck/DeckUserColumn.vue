<script setup lang="ts">
import { onMounted, ref, shallowRef } from 'vue'
import { useRouter } from 'vue-router'
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
  postForm,
  handlers,
  scroller,
  onScroll,
} = useColumnSetup(() => props.column)

const router = useRouter()
const notes = shallowRef<NormalizedNote[]>([])
const { focusedNoteId } = useNoteFocus(
  props.column.id,
  notes,
  scroller,
  handlers,
  (note) => router.push(`/note/${note._accountId}/${note.id}`),
)
const noteIds = new Set<string>()

function setNotes(newNotes: NormalizedNote[]) {
  notes.value = newNotes
  noteIds.clear()
  for (const n of newNotes) noteIds.add(n.id)
}

async function connect() {
  error.value = null
  isLoading.value = true

  try {
    const adapter = await initAdapter()
    if (!adapter) return

    const userId = props.column.userId
    if (!userId) return

    const fetched = await adapter.api.getUserNotes(userId)
    if (fetched.length > 0) {
      setNotes(fetched)
    }
  } catch (e) {
    error.value = AppError.from(e)
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

void applyNoteUpdate

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

async function refresh() {
  const adapter = getAdapter()
  if (!adapter || isLoading.value) return
  const userId = props.column.userId
  if (!userId) return
  isLoading.value = true
  error.value = null
  try {
    const firstNote = notes.value[0]
    if (firstNote) {
      const newer = await adapter.api.getUserNotes(userId, {
        sinceId: firstNote.id,
      })
      if (newer.length > 0) {
        setNotes([...newer.reverse(), ...notes.value])
        scrollToTop()
      }
    } else {
      const fetched = await adapter.api.getUserNotes(userId)
      if (fetched.length > 0) setNotes(fetched)
    }
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
  const userId = props.column.userId
  if (!userId) return
  isLoading.value = true
  try {
    const older = await adapter.api.getUserNotes(userId, {
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

onMounted(() => {
  connect()
})
</script>

<template>
  <DeckColumn
    :column-id="column.id"
    :title="column.name || 'User'"
    :theme-vars="columnThemeVars"
    @header-click="scrollToTop(true)"
  >
    <template #header-icon>
      <i class="ti ti-user tl-header-icon" />
    </template>

    <template #header-meta>
      <button class="_button header-refresh" title="Refresh" :disabled="isLoading" @click.stop="refresh">
        <i class="ti ti-refresh" :class="{ 'spin': isLoading }" />
      </button>
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

<style scoped>
.tl-header-icon {
  flex-shrink: 0;
  opacity: 0.7;
}

.header-refresh {
  flex-shrink: 0;
  opacity: 0.6;
  font-size: 14px;
  padding: 2px;
  transition: opacity 0.2s;
}

.header-refresh:hover {
  opacity: 1;
}

.header-refresh:disabled {
  opacity: 0.3;
}

.spin {
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
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
