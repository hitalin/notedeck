<script setup lang="ts">
import { invoke } from '@tauri-apps/api/core'
import { defineAsyncComponent, onMounted, ref, watch } from 'vue'
import { initAdapterFor } from '@/adapters/initAdapter'
import type {
  NormalizedNote,
  NoteReaction,
  ServerAdapter,
} from '@/adapters/types'
import MkAvatar from '@/components/common/MkAvatar.vue'
import MkEmoji from '@/components/common/MkEmoji.vue'
import MkNote from '@/components/common/MkNote.vue'

const MkPostForm = defineAsyncComponent(
  () => import('@/components/common/MkPostForm.vue'),
)

import { useEmojiResolver } from '@/composables/useEmojiResolver'
import { useNavigation } from '@/composables/useNavigation'
import { useAccountsStore } from '@/stores/accounts'
import { useNoteStore } from '@/stores/notes'
import { AppError } from '@/utils/errors'
import { proxyUrl } from '@/utils/imageProxy'
import { toggleReaction } from '@/utils/toggleReaction'

const props = defineProps<{
  accountId: string
  noteId: string
}>()

const emit = defineEmits<{ close: [] }>()

const noteStore = useNoteStore()
const accountsStore = useAccountsStore()
const { navigateToUser: navToUser } = useNavigation()
const { reactionUrl: reactionUrlRaw } = useEmojiResolver()

const note = ref<NormalizedNote | null>(null)
const ancestors = ref<NormalizedNote[]>([])
const children = ref<NormalizedNote[]>([])
const renotes = ref<NormalizedNote[]>([])
const reactions = ref<NoteReaction[]>([])
const isLoading = ref(true)
const error = ref<AppError | null>(null)

type DetailTab = 'replies' | 'renotes' | 'reactions'
const activeTab = ref<DetailTab>('replies')

const DETAIL_TABS: { key: DetailTab; label: string; icon: string }[] = [
  { key: 'replies', label: '返信', icon: 'ti ti-arrow-back-up' },
  { key: 'renotes', label: 'リノート', icon: 'ti ti-repeat' },
  { key: 'reactions', label: 'リアクション', icon: 'ti ti-mood-happy' },
]

let adapter: ServerAdapter | null = null

onMounted(async () => {
  const account = accountsStore.accounts.find((a) => a.id === props.accountId)
  if (!account) {
    error.value = new AppError('ACCOUNT_NOT_FOUND', 'Account not found')
    isLoading.value = false
    return
  }

  try {
    const result = await initAdapterFor(account.host, account.id, {
      pinnedReactions: false,
    })
    adapter = result.adapter
    note.value = await adapter.api.getNote(props.noteId)

    const [conv, replies] = await Promise.all([
      adapter.api
        .getNoteConversation(props.noteId)
        .catch(() => [] as NormalizedNote[]),
      adapter.api
        .getNoteChildren(props.noteId)
        .catch(() => [] as NormalizedNote[]),
    ])
    ancestors.value = conv.reverse()
    children.value = replies
  } catch (e) {
    error.value = AppError.from(e)
  } finally {
    isLoading.value = false
  }
})

const loadedTabs = ref<Set<DetailTab>>(new Set(['replies']))

watch(activeTab, async (tab) => {
  if (loadedTabs.value.has(tab) || !adapter) return
  loadedTabs.value.add(tab)
  try {
    if (tab === 'renotes') {
      renotes.value = await adapter.api.getNoteRenotes(props.noteId)
    } else if (tab === 'reactions') {
      reactions.value = await adapter.api.getNoteReactions(
        props.noteId,
        undefined,
        100,
      )
    }
  } catch (e) {
    console.warn('[NoteDetail] failed to load tab:', tab, e)
  }
})

function getReactionUrl(reaction: NoteReaction): string | null {
  if (!note.value) return null
  return reactionUrlRaw(
    reaction.type,
    note.value.emojis,
    note.value.reactionEmojis,
    note.value._serverHost,
  )
}

async function handleReaction(reaction: string, target: NormalizedNote) {
  if (!adapter) return
  try {
    await toggleReaction(adapter.api, target, reaction)
  } catch (e) {
    error.value = AppError.from(e)
  }
}

const showPostForm = ref(false)
const postFormReplyTo = ref<NormalizedNote | undefined>()
const postFormRenoteId = ref<string | undefined>()
const postFormEditNote = ref<NormalizedNote | undefined>()

async function handleRenote(target: NormalizedNote) {
  if (!adapter) return
  try {
    await adapter.api.createNote({ renoteId: target.id })
  } catch (e) {
    error.value = AppError.from(e)
  }
}

function handleReply(target: NormalizedNote) {
  postFormReplyTo.value = target
  postFormRenoteId.value = undefined
  showPostForm.value = true
}

function handleQuote(target: NormalizedNote) {
  postFormReplyTo.value = undefined
  postFormRenoteId.value = target.id
  showPostForm.value = true
}

function handleEdit(target: NormalizedNote) {
  postFormReplyTo.value = undefined
  postFormRenoteId.value = undefined
  postFormEditNote.value = target
  showPostForm.value = true
}

async function handleDelete(target: NormalizedNote) {
  if (!adapter) return
  try {
    await adapter.api.deleteNote(target.id)
    const id = target.id
    noteStore.remove(id)
    invoke('api_delete_cached_note', { noteId: id }).catch(() => {})
    if (id === note.value?.id) {
      emit('close')
    } else {
      children.value = children.value.filter(
        (n) => n.id !== id && n.renoteId !== id,
      )
      ancestors.value = ancestors.value.filter(
        (n) => n.id !== id && n.renoteId !== id,
      )
    }
  } catch (e) {
    error.value = AppError.from(e)
  }
}

function closePostForm() {
  showPostForm.value = false
  postFormReplyTo.value = undefined
  postFormRenoteId.value = undefined
  postFormEditNote.value = undefined
}

async function handlePosted(editedNoteId?: string) {
  closePostForm()
  if (editedNoteId && adapter) {
    try {
      const updated = await adapter.api.getNote(editedNoteId)
      if (note.value?.id === editedNoteId) {
        note.value = updated
      }
      children.value = children.value.map((n) =>
        n.id === editedNoteId
          ? updated
          : n.renoteId === editedNoteId
            ? { ...n, renote: updated }
            : n,
      )
      ancestors.value = ancestors.value.map((n) =>
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
</script>

<template>
  <div class="note-detail-content">
    <div v-if="isLoading" class="state-message">読み込み中...</div>

    <div v-else-if="error" class="state-message state-error">
      <p>{{ error.message }}</p>
    </div>

    <div v-else-if="note" class="note-detail">
      <div v-if="ancestors.length > 0" class="ancestors">
        <MkNote
          v-for="ancestor in ancestors"
          :key="ancestor.id"
          :note="ancestor"
          @react="handleReaction"
          @reply="handleReply"
          @renote="handleRenote"
          @quote="handleQuote"
          @delete="handleDelete"
          @edit="handleEdit"
        />
      </div>

      <div class="focal-note">
        <MkNote
          :note="note"
          detailed
          @react="handleReaction"
          @reply="handleReply"
          @renote="handleRenote"
          @quote="handleQuote"
          @delete="handleDelete"
          @edit="handleEdit"
        />
      </div>

      <!-- Tabs -->
      <div class="detail-tabs">
        <button
          v-for="tab in DETAIL_TABS"
          :key="tab.key"
          class="detail-tab-item _button"
          :class="{ active: activeTab === tab.key }"
          @click="activeTab = tab.key"
        >
          <i :class="tab.icon" />
          {{ tab.label }}
        </button>
      </div>

      <!-- Tab: Replies -->
      <div v-if="activeTab === 'replies'">
        <MkNote
          v-for="child in children"
          :key="child.id"
          :note="child"
          @react="handleReaction"
          @reply="handleReply"
          @renote="handleRenote"
          @quote="handleQuote"
          @delete="handleDelete"
          @edit="handleEdit"
        />
        <div v-if="children.length === 0" class="state-message">
          返信はありません
        </div>
      </div>

      <!-- Tab: Renotes -->
      <div v-if="activeTab === 'renotes'">
        <div v-if="renotes.length > 0" class="renote-users">
          <button
            v-for="rn in renotes"
            :key="rn.id"
            class="renote-user-item _button"
            @click="navToUser(accountId, rn.user.id)"
          >
            <MkAvatar
              :avatar-url="rn.user.avatarUrl"
              :decorations="rn.user.avatarDecorations"
              :size="36"
            />
            <span class="renote-user-name">
              {{ rn.user.name || rn.user.username }}
            </span>
            <span class="renote-user-handle">
              @{{ rn.user.username }}
            </span>
          </button>
        </div>
        <div v-else class="state-message">
          リノートはありません
        </div>
      </div>

      <!-- Tab: Reactions -->
      <div v-if="activeTab === 'reactions'">
        <div v-if="reactions.length > 0" class="reaction-users">
          <div
            v-for="r in reactions"
            :key="r.id"
            class="reaction-user-item"
          >
            <button
              class="reaction-user-left _button"
              @click="navToUser(accountId, r.user.id)"
            >
              <MkAvatar
                :avatar-url="r.user.avatarUrl"
                :decorations="r.user.avatarDecorations"
                :size="36"
              />
              <span class="reaction-user-name">
                {{ r.user.name || r.user.username }}
              </span>
              <span class="reaction-user-handle">
                @{{ r.user.username }}
              </span>
            </button>
            <span class="reaction-type">
              <img
                v-if="getReactionUrl(r)"
                :src="proxyUrl(getReactionUrl(r)!)"
                :alt="r.type"
                class="reaction-emoji-img"
                decoding="async"
              />
              <MkEmoji v-else :emoji="r.type" class="reaction-emoji" />
            </span>
          </div>
        </div>
        <div v-else class="state-message">
          リアクションはありません
        </div>
      </div>
    </div>

    <Teleport to="body">
      <MkPostForm
        v-if="showPostForm"
        :account-id="accountId"
        :reply-to="postFormReplyTo"
        :renote-id="postFormRenoteId"
        :edit-note="postFormEditNote"
        @close="closePostForm"
        @posted="handlePosted"
      />
    </Teleport>
  </div>
</template>

<style scoped>
.note-detail-content {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
  background: var(--nd-bg);
}

.note-detail {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  scrollbar-color: var(--nd-scrollbarHandle) transparent;
  scrollbar-width: thin;
}

.ancestors {
  opacity: 0.85;
}

.ancestors :deep(.note-root + .note-root) {
  border-top: none;
}

.focal-note {
  border-top: 2px solid var(--nd-accent);
  border-bottom: 1px solid var(--nd-divider);
  background: var(--nd-panelHighlight);
}

/* Tabs */
.detail-tabs {
  display: flex;
  border-bottom: solid 0.5px var(--nd-divider);
  position: sticky;
  top: 0;
  background: var(--nd-bg);
  z-index: 5;
}

.detail-tab-item {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 14px 8px;
  font-size: 0.85em;
  font-weight: bold;
  color: var(--nd-fg);
  opacity: 0.6;
  border-bottom: 2px solid transparent;
  transition: opacity var(--nd-duration-base), border-color var(--nd-duration-base);
}

.detail-tab-item:hover {
  opacity: 0.8;
}

.detail-tab-item.active {
  color: var(--nd-accent);
  opacity: 1;
  border-bottom-color: var(--nd-accent);
}

.detail-tab-item i {
  font-size: 1em;
}

/* Renote users list */
.renote-users {
  display: flex;
  flex-direction: column;
}

.renote-user-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 24px;
  transition: background var(--nd-duration-base);
}

.renote-user-item:hover {
  background: var(--nd-panelHighlight);
}

.renote-user-name {
  font-weight: bold;
  font-size: 0.9em;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.renote-user-handle {
  font-size: 0.8em;
  opacity: 0.6;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* Reaction users list */
.reaction-users {
  display: flex;
  flex-direction: column;
}

.reaction-user-item {
  display: flex;
  align-items: center;
  padding: 10px 24px;
  gap: 10px;
}

.reaction-user-left {
  display: flex;
  align-items: center;
  gap: 10px;
  flex: 1;
  min-width: 0;
  transition: opacity var(--nd-duration-base);
}

.reaction-user-left:hover {
  opacity: 0.7;
}

.reaction-user-name {
  font-weight: bold;
  font-size: 0.9em;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.reaction-user-handle {
  font-size: 0.8em;
  opacity: 0.6;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.reaction-type {
  flex-shrink: 0;
}

.reaction-emoji-img {
  height: 1.5em;
  width: auto;
}

.reaction-emoji {
  font-size: 1.5em;
}

.state-message {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 2rem;
  color: var(--nd-fg);
  opacity: 0.6;
  font-size: 0.9em;
}

.state-error {
  color: var(--nd-love);
  opacity: 1;
}

@media (max-width: 500px) {
  .detail-tab-item {
    min-height: 44px;
  }

  .renote-user-item,
  .reaction-user-item {
    padding: 10px 16px;
  }
}

/* Mobile platform (viewport may exceed 500px) */
html.nd-mobile .detail-tab-item {
  min-height: 44px;
}

html.nd-mobile .renote-user-item,
html.nd-mobile .reaction-user-item {
  padding: 10px 16px;
}
</style>
