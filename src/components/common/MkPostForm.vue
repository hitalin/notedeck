<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { createAdapter } from '@/adapters/registry'
import type { NormalizedNote, ServerAdapter } from '@/adapters/types'
import { useAccountsStore } from '@/stores/accounts'
import { useServersStore } from '@/stores/servers'

const props = defineProps<{
  accountId: string
  replyTo?: NormalizedNote
  renoteId?: string
}>()

const emit = defineEmits<{
  close: []
  posted: []
}>()

const accountsStore = useAccountsStore()
const serversStore = useServersStore()

const text = ref('')
const cw = ref('')
const showCw = ref(false)
const visibility = ref<'public' | 'home' | 'followers' | 'specified'>('public')
const isPosting = ref(false)
const error = ref<string | null>(null)

let adapter: ServerAdapter | null = null

const account = accountsStore.accounts.find((a) => a.id === props.accountId)

onMounted(async () => {
  if (!account) return
  try {
    const serverInfo = await serversStore.getServerInfo(account.host)
    adapter = createAdapter(serverInfo, account.token, account.id)
  } catch {
    error.value = 'Failed to connect'
  }

  if (props.replyTo) {
    visibility.value = props.replyTo.visibility
  }
})

async function post() {
  if (!adapter) return
  if (!text.value.trim() && !props.renoteId) return

  isPosting.value = true
  error.value = null

  try {
    await adapter.api.createNote({
      text: text.value || undefined,
      cw: showCw.value && cw.value ? cw.value : undefined,
      visibility: visibility.value,
      replyId: props.replyTo?.id,
      renoteId: props.renoteId,
    })
    emit('posted')
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Post failed'
  } finally {
    isPosting.value = false
  }
}

function onKeydown(e: KeyboardEvent) {
  if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
    post()
  }
}
</script>

<template>
  <div class="post-overlay" @click="emit('close')">
    <div class="post-form" @click.stop>
      <header class="post-header">
        <span class="post-header-title">
          {{ replyTo ? 'Reply' : renoteId ? 'Quote' : 'New Note' }}
        </span>
        <span v-if="account" class="post-header-account">
          @{{ account.username }}@{{ account.host }}
        </span>
        <button class="_button post-close" @click="emit('close')">
          <svg viewBox="0 0 24 24" width="16" height="16">
            <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
          </svg>
        </button>
      </header>

      <div v-if="replyTo" class="reply-preview">
        <div class="reply-preview-header">
          <img
            v-if="replyTo.user.avatarUrl"
            :src="replyTo.user.avatarUrl"
            class="reply-avatar"
          />
          <span class="reply-user">{{ replyTo.user.name || replyTo.user.username }}</span>
        </div>
        <p class="reply-text">{{ replyTo.text }}</p>
      </div>

      <div class="post-body">
        <input
          v-if="showCw"
          v-model="cw"
          class="cw-input"
          placeholder="Content Warning"
        />
        <textarea
          ref="textareaRef"
          v-model="text"
          class="post-textarea"
          :placeholder="replyTo ? 'Reply...' : renoteId ? 'Quote...' : 'What\'s on your mind?'"
          autofocus
          @keydown="onKeydown"
        />
      </div>

      <div v-if="error" class="post-error">{{ error }}</div>

      <footer class="post-footer">
        <div class="post-actions">
          <button
            class="_button post-action-btn"
            :class="{ active: showCw }"
            title="Content Warning"
            @click="showCw = !showCw"
          >
            CW
          </button>
          <select v-model="visibility" class="visibility-select">
            <option value="public">Public</option>
            <option value="home">Home</option>
            <option value="followers">Followers</option>
            <option value="specified">Direct</option>
          </select>
        </div>
        <button
          class="post-submit"
          :disabled="isPosting || (!text.trim() && !renoteId)"
          @click="post"
        >
          {{ isPosting ? 'Posting...' : 'Note' }}
        </button>
      </footer>
    </div>
  </div>
</template>

<style scoped>
.post-overlay {
  position: fixed;
  inset: 0;
  z-index: 2000;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--nd-modalBg);
}

.post-form {
  background: var(--nd-popup);
  border-radius: 16px;
  box-shadow: 0 8px 32px var(--nd-shadow);
  width: 100%;
  max-width: 520px;
  margin: 16px;
  overflow: clip;
  display: flex;
  flex-direction: column;
}

.post-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 16px 20px 12px;
  border-bottom: 1px solid var(--nd-divider);
}

.post-header-title {
  font-size: 0.95em;
  font-weight: bold;
  color: var(--nd-fgHighlighted);
}

.post-header-account {
  font-size: 0.8em;
  opacity: 0.6;
}

.post-close {
  margin-left: auto;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border-radius: 6px;
  color: var(--nd-fg);
  opacity: 0.6;
  transition: opacity 0.15s, background 0.15s;
}

.post-close:hover {
  opacity: 1;
  background: var(--nd-buttonHoverBg);
}

/* Reply preview */
.reply-preview {
  padding: 12px 20px;
  border-bottom: 1px solid var(--nd-divider);
  font-size: 0.85em;
  opacity: 0.7;
  max-height: 120px;
  overflow-y: auto;
}

.reply-preview-header {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 4px;
}

.reply-avatar {
  width: 20px;
  height: 20px;
  border-radius: 50%;
}

.reply-user {
  font-weight: bold;
  font-size: 0.9em;
}

.reply-text {
  margin: 0;
  white-space: pre-wrap;
  word-break: break-word;
  line-height: 1.4;
}

/* Body */
.post-body {
  padding: 0 20px;
}

.cw-input {
  display: block;
  width: 100%;
  padding: 10px 0;
  font-size: 0.9em;
  font-family: inherit;
  color: var(--nd-fg);
  background: transparent;
  border: none;
  border-bottom: 1px solid var(--nd-divider);
  outline: none;
}

.post-textarea {
  display: block;
  width: 100%;
  min-height: 120px;
  padding: 12px 0;
  font-size: 1em;
  font-family: inherit;
  color: var(--nd-fg);
  background: transparent;
  border: none;
  outline: none;
  resize: vertical;
  line-height: 1.5;
}

.post-textarea::placeholder,
.cw-input::placeholder {
  color: var(--nd-fg);
  opacity: 0.35;
}

.post-error {
  padding: 8px 20px;
  color: var(--nd-love);
  font-size: 0.85em;
}

/* Footer */
.post-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 20px;
  border-top: 1px solid var(--nd-divider);
}

.post-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.post-action-btn {
  padding: 4px 8px;
  font-size: 0.8em;
  font-weight: bold;
  font-family: inherit;
  border-radius: 4px;
  color: var(--nd-fg);
  opacity: 0.6;
  transition: opacity 0.15s, background 0.15s;
}

.post-action-btn:hover {
  opacity: 1;
  background: var(--nd-buttonHoverBg);
}

.post-action-btn.active {
  opacity: 1;
  color: var(--nd-accent);
}

.visibility-select {
  padding: 4px 8px;
  font-size: 0.8em;
  font-family: inherit;
  color: var(--nd-fg);
  background: var(--nd-buttonBg);
  border: none;
  border-radius: 4px;
  cursor: pointer;
}

.post-submit {
  padding: 7px 16px;
  font-size: 0.9em;
  font-weight: bold;
  font-family: inherit;
  border: none;
  border-radius: 5px;
  background: var(--nd-accent);
  color: var(--nd-fgOnAccent);
  cursor: pointer;
  transition: background 0.1s;
}

.post-submit:hover:not(:disabled) {
  background: hsl(from var(--nd-accent) h s calc(l + 5));
}

.post-submit:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
</style>
