<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { createAdapter } from '@/adapters/registry'
import type { NormalizedNote, ServerAdapter } from '@/adapters/types'
import MkNote from '@/components/common/MkNote.vue'
import MkPostForm from '@/components/common/MkPostForm.vue'
import { useAccountsStore } from '@/stores/accounts'
import { useEmojisStore } from '@/stores/emojis'
import { useServersStore } from '@/stores/servers'

const props = defineProps<{
  accountId: string
  noteId: string
}>()

const accountsStore = useAccountsStore()
const emojisStore = useEmojisStore()
const serversStore = useServersStore()

const note = ref<NormalizedNote | null>(null)
const isLoading = ref(true)
const error = ref<string | null>(null)

let adapter: ServerAdapter | null = null

onMounted(async () => {
  const account = accountsStore.accounts.find((a) => a.id === props.accountId)
  if (!account) {
    error.value = 'Account not found'
    isLoading.value = false
    return
  }

  try {
    const serverInfo = await serversStore.getServerInfo(account.host)
    adapter = createAdapter(serverInfo, account.token, account.id)
    if (!emojisStore.has(account.host)) {
      adapter.api.getServerEmojis().then((emojis) => {
        emojisStore.set(account.host, emojis)
      }).catch(() => {})
    }
    note.value = await adapter.api.getNote(props.noteId)
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Failed to load note'
  } finally {
    isLoading.value = false
  }
})

async function handleReaction(reaction: string) {
  if (!adapter || !note.value) return

  try {
    if (note.value.myReaction === reaction) {
      await adapter.api.deleteReaction(note.value.id)
      if ((note.value.reactions[reaction] ?? 0) > 1) {
        note.value.reactions[reaction]!--
      } else {
        delete note.value.reactions[reaction]
      }
      note.value.myReaction = null
    } else {
      if (note.value.myReaction) {
        await adapter.api.deleteReaction(note.value.id)
        const prev = note.value.myReaction
        if ((note.value.reactions[prev] ?? 0) > 1) {
          note.value.reactions[prev]!--
        } else {
          delete note.value.reactions[prev]
        }
      }
      await adapter.api.createReaction(note.value.id, reaction)
      note.value.reactions[reaction] = (note.value.reactions[reaction] ?? 0) + 1
      note.value.myReaction = reaction
    }
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Reaction failed'
  }
}

// Post form state
const showPostForm = ref(false)
const postFormReplyTo = ref<NormalizedNote | undefined>()
const postFormRenoteId = ref<string | undefined>()

async function handleRenote(target: NormalizedNote) {
  if (!adapter) return
  try {
    await adapter.api.createNote({ renoteId: target.id })
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Renote failed'
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

function closePostForm() {
  showPostForm.value = false
  postFormReplyTo.value = undefined
  postFormRenoteId.value = undefined
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
      <p>{{ error }}</p>
    </div>

    <div v-else-if="note" class="note-detail">
      <MkNote
        :note="note"
        detailed
        @react="handleReaction"
        @reply="handleReply"
        @renote="handleRenote"
        @quote="handleQuote"
      />
    </div>

    <Teleport to="body">
      <MkPostForm
        v-if="showPostForm"
        :account-id="accountId"
        :reply-to="postFormReplyTo"
        :renote-id="postFormRenoteId"
        @close="closePostForm"
        @posted="closePostForm"
      />
    </Teleport>
  </div>
</template>

<style scoped>
.note-detail-page {
  display: flex;
  flex-direction: column;
  min-height: 100vh;
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
  max-width: 600px;
  width: 100%;
  margin: 0 auto;
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
</style>
