<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { createAdapter } from '@/adapters/registry'
import type { NormalizedNote, ServerAdapter } from '@/adapters/types'
import MkNote from '@/components/common/MkNote.vue'
import MkPostForm from '@/components/common/MkPostForm.vue'
import { useAccountsStore } from '@/stores/accounts'
import { useEmojisStore } from '@/stores/emojis'
import { useServersStore } from '@/stores/servers'
import { AppError } from '@/utils/errors'
import { toggleReaction } from '@/utils/toggleReaction'

const props = defineProps<{
  accountId: string
  noteId: string
}>()

const router = useRouter()
const accountsStore = useAccountsStore()
const emojisStore = useEmojisStore()
const serversStore = useServersStore()

const note = ref<NormalizedNote | null>(null)
const ancestors = ref<NormalizedNote[]>([])
const children = ref<NormalizedNote[]>([])
const isLoading = ref(true)
const error = ref<AppError | null>(null)

let adapter: ServerAdapter | null = null

onMounted(async () => {
  const account = accountsStore.accounts.find((a) => a.id === props.accountId)
  if (!account) {
    error.value = new AppError('ACCOUNT_NOT_FOUND', 'Account not found')
    isLoading.value = false
    return
  }

  try {
    const serverInfo = await serversStore.getServerInfo(account.host)
    const a = createAdapter(serverInfo, account.id)
    adapter = a
    emojisStore.ensureLoaded(account.host, () => a.api.getServerEmojis())
    note.value = await adapter.api.getNote(props.noteId)

    // Fetch conversation (ancestors) and children in parallel
    const [conv, replies] = await Promise.all([
      adapter.api
        .getNoteConversation(props.noteId)
        .catch(() => [] as NormalizedNote[]),
      adapter.api
        .getNoteChildren(props.noteId)
        .catch(() => [] as NormalizedNote[]),
    ])
    // Conversation API returns newest-first, reverse to show oldest at top
    ancestors.value = conv.reverse()
    children.value = replies
  } catch (e) {
    error.value = AppError.from(e)
  } finally {
    isLoading.value = false
  }
})

async function handleReaction(reaction: string, target: NormalizedNote) {
  if (!adapter) return
  const n = target
  try {
    await toggleReaction(adapter.api, n, reaction)
  } catch (e) {
    error.value = AppError.from(e)
  }
}

// Post form state
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
    if (id === note.value?.id) {
      router.back()
    } else {
      children.value = children.value.filter(
        (n) => n.id !== id && n.renote?.id !== id,
      )
      ancestors.value = ancestors.value.filter(
        (n) => n.id !== id && n.renote?.id !== id,
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
          : n.renote?.id === editedNoteId
            ? { ...n, renote: updated }
            : n,
      )
      ancestors.value = ancestors.value.map((n) =>
        n.id === editedNoteId
          ? updated
          : n.renote?.id === editedNoteId
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
  <div class="note-detail-page">
    <header class="detail-header">
      <router-link to="/" class="back-btn _button">
        <svg viewBox="0 0 24 24" width="20" height="20">
          <path
            d="M15 18l-6-6 6-6"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
            fill="none"
          />
        </svg>
      </router-link>
      <h1 class="detail-title">Note</h1>
    </header>

    <div v-if="isLoading" class="state-message">Loading...</div>

    <div v-else-if="error" class="state-message state-error">
      <p>{{ error.message }}</p>
    </div>

    <div v-else-if="note" class="note-detail">
      <!-- Ancestor chain (conversation) -->
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

      <!-- Focal note -->
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

      <!-- Child replies -->
      <div v-if="children.length > 0" class="children">
        <div class="children-header">Replies</div>
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
.note-detail-page {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
  background: var(--nd-bg);
}

.detail-header {
  display: flex;
  align-items: center;
  gap: 8px;
  height: 50px;
  padding: 0 16px;
  border-bottom: 1px solid var(--nd-divider);
  position: sticky;
  top: 0;
  background: var(--nd-windowHeader);
  backdrop-filter: blur(15px);
  z-index: 10;
}

.back-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border-radius: 6px;
  color: var(--nd-fg);
  text-decoration: none;
  transition: background 0.15s;
}

.back-btn:hover {
  background: var(--nd-buttonHoverBg);
  text-decoration: none;
}

.detail-title {
  font-size: 0.9em;
  font-weight: bold;
  margin: 0;
  color: var(--nd-fgHighlighted);
}

.note-detail {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  scrollbar-color: var(--nd-scrollbarHandle) transparent;
  scrollbar-width: thin;
  max-width: 600px;
  width: 100%;
  margin: 0 auto;
}

.ancestors {
  opacity: 0.85;
  border-left: 3px solid var(--nd-accent);
}

.focal-note {
  border-top: 1px solid var(--nd-divider);
  border-bottom: 1px solid var(--nd-divider);
}

.children-header {
  padding: 12px 32px 4px;
  font-size: 0.85em;
  font-weight: bold;
  color: var(--nd-fg);
  opacity: 0.6;
}

.state-message {
  flex: 1;
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
</style>
