<script setup lang="ts">
import { invoke } from '@tauri-apps/api/core'
import { ref } from 'vue'
import { MisskeyApi } from '@/adapters/misskey/api'
import type { NormalizedNote } from '@/adapters/types'
import MkNote from '@/components/common/MkNote.vue'
import MkPostForm from '@/components/common/MkPostForm.vue'
import { useColumnTheme } from '@/composables/useColumnTheme'
import { useNavigation } from '@/composables/useNavigation'
import { useAccountsStore } from '@/stores/accounts'
import type { DeckColumn as DeckColumnType } from '@/stores/deck'
import { useServersStore } from '@/stores/servers'
import { parseNoteUrl } from '@/utils/noteUrl'
import DeckColumn from './DeckColumn.vue'

const props = defineProps<{
  column: DeckColumnType
}>()

const { account, columnThemeVars } = useColumnTheme(() => props.column)
const accountsStore = useAccountsStore()
const serversStore = useServersStore()
const { navigateToUser } = useNavigation()

const queryInput = ref('')
const isLoading = ref(false)
const error = ref<string | null>(null)

type LookupResult =
  | { type: 'Note'; note: NormalizedNote }
  | {
      type: 'User'
      user: {
        id: string
        username: string
        host: string | null
        name: string | null
        avatarUrl: string | null
      }
    }

const result = ref<LookupResult | null>(null)

// Post form state
const showPostForm = ref(false)
const postFormReplyTo = ref<NormalizedNote | undefined>()
const postFormRenoteId = ref<string | undefined>()
const postFormEditNote = ref<NormalizedNote | undefined>()

const serverIconUrl = ref<string | null>(null)
if (account.value) {
  serversStore
    .getServerInfo(account.value.host)
    .then((info) => {
      serverIconUrl.value = info.iconUrl ?? null
    })
    .catch(() => {})
}

async function performLookup() {
  const q = queryInput.value.trim()
  if (!q || !props.column.accountId) return

  isLoading.value = true
  error.value = null
  result.value = null

  const acc = accountsStore.accountMap.get(props.column.accountId)
  if (!acc) {
    error.value = 'アカウントが見つかりません'
    isLoading.value = false
    return
  }

  const accountId = props.column.accountId
  const api = new MisskeyApi(accountId)

  try {
    // Check if input is @user or @user@host format
    const raw = q.replace(/^@/, '')
    const parts = raw.split('@')
    if (
      parts[0] &&
      /^[a-zA-Z0-9_]+$/.test(parts[0]) &&
      (q.startsWith('@') || (parts.length === 2 && parts[1]))
    ) {
      const username = parts[0]
      const host = parts[1] || null
      const user = await invoke<{
        id: string
        username: string
        host: string | null
        name: string | null
        avatarUrl: string | null
      }>('api_lookup_user', { accountId, username, host })
      result.value = {
        type: 'User',
        user: {
          id: user.id,
          username: user.username,
          host: user.host,
          name: user.name,
          avatarUrl: user.avatarUrl,
        },
      }
      isLoading.value = false
      return
    }

    // Try parsing as a note URL for same-server direct fetch
    const parsed = parseNoteUrl(q)
    if (parsed && parsed.host === acc.host) {
      const note = await api.getNote(parsed.noteId)
      result.value = { type: 'Note', note }
      isLoading.value = false
      return
    }

    // Use ap/show for remote URLs or any URI
    const res = await invoke<{
      type: string
      object?: {
        id: string
        username?: string
        host?: string | null
        name?: string | null
        avatarUrl?: string | null
      }
    }>('api_request', {
      accountId,
      endpoint: 'ap/show',
      params: { uri: q },
    })

    if (res.type === 'Note' && res.object?.id) {
      const note = await api.getNote(res.object.id)
      result.value = { type: 'Note', note }
    } else if (res.type === 'User' && res.object?.id) {
      result.value = {
        type: 'User',
        user: {
          id: res.object.id,
          username: res.object.username ?? '',
          host: res.object.host ?? null,
          name: res.object.name ?? null,
          avatarUrl: res.object.avatarUrl ?? null,
        },
      }
    } else {
      error.value = '照会できませんでした'
    }
  } catch {
    error.value = '照会できませんでした'
  } finally {
    isLoading.value = false
  }
}

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Enter') {
    performLookup()
  }
}

function openUser() {
  if (result.value?.type === 'User' && props.column.accountId) {
    navigateToUser(props.column.accountId, result.value.user.id)
  }
}

async function handleReaction(_reaction: string, target: NormalizedNote) {
  const accountId = props.column.accountId
  if (!accountId) return
  const api = new MisskeyApi(accountId)
  const { toggleReaction } = await import('@/utils/toggleReaction')
  try {
    await toggleReaction(api, target, _reaction)
  } catch {
    // ignore
  }
}

function handleReply(target: NormalizedNote) {
  postFormReplyTo.value = target
  postFormRenoteId.value = undefined
  postFormEditNote.value = undefined
  showPostForm.value = true
}

async function handleRenote(target: NormalizedNote) {
  const accountId = props.column.accountId
  if (!accountId) return
  const api = new MisskeyApi(accountId)
  try {
    await api.createNote({ renoteId: target.id })
  } catch {
    // ignore
  }
}

function handleQuote(target: NormalizedNote) {
  postFormReplyTo.value = undefined
  postFormRenoteId.value = target.id
  postFormEditNote.value = undefined
  showPostForm.value = true
}

function handleEdit(target: NormalizedNote) {
  postFormReplyTo.value = undefined
  postFormRenoteId.value = undefined
  postFormEditNote.value = target
  showPostForm.value = true
}

async function handleDelete(target: NormalizedNote) {
  const accountId = props.column.accountId
  if (!accountId) return
  const api = new MisskeyApi(accountId)
  try {
    await api.deleteNote(target.id)
    if (result.value?.type === 'Note' && result.value.note.id === target.id) {
      result.value = null
    }
  } catch {
    // ignore
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
  const accountId = props.column.accountId
  if (editedNoteId && accountId && result.value?.type === 'Note') {
    const api = new MisskeyApi(accountId)
    try {
      const updated = await api.getNote(editedNoteId)
      if (result.value.note.id === editedNoteId) {
        result.value = { type: 'Note', note: updated }
      }
    } catch {
      // ignore
    }
  }
}
</script>

<template>
  <DeckColumn
    :column-id="column.id"
    :title="column.name ?? '照会'"
    :theme-vars="columnThemeVars"
  >
    <template #header-icon>
      <i class="ti ti-world-search lookup-header-icon" />
    </template>

    <template #header-meta>
      <div v-if="account" class="header-account">
        <img v-if="account.avatarUrl" :src="account.avatarUrl" class="header-avatar" />
        <img class="header-favicon" :src="serverIconUrl || `https://${account.host}/favicon.ico`" :title="account.host" />
      </div>
    </template>

    <template #header-extra>
      <div class="lookup-bar">
        <i class="ti ti-world-search lookup-icon" />
        <input
          v-model="queryInput"
          class="lookup-input"
          type="text"
          placeholder="URL or @user@host"
          @keydown="onKeydown"
        />
        <button
          class="_button lookup-btn"
          :disabled="!queryInput.trim() || isLoading"
          @click="performLookup"
        >
          <i class="ti ti-arrow-right" />
        </button>
      </div>
    </template>

    <div v-if="!account" class="column-empty">
      Account not found
    </div>

    <div v-else-if="isLoading" class="column-empty">
      照会中...
    </div>

    <div v-else-if="error" class="column-empty column-error">
      {{ error }}
    </div>

    <div v-else-if="!result" class="column-empty">
      URLまたは@ユーザー名を入力して照会
    </div>

    <div v-else-if="result.type === 'Note'" class="lookup-result">
      <MkNote
        :note="result.note"
        detailed
        @react="handleReaction"
        @reply="handleReply"
        @renote="handleRenote"
        @quote="handleQuote"
        @delete="handleDelete"
        @edit="handleEdit"
      />
    </div>

    <div v-else-if="result.type === 'User'" class="lookup-result">
      <button class="_button lookup-user-card" @click="openUser">
        <img v-if="result.user.avatarUrl" :src="result.user.avatarUrl" class="lookup-user-avatar" />
        <div class="lookup-user-info">
          <span class="lookup-user-name">{{ result.user.name || result.user.username }}</span>
          <span class="lookup-user-handle">
            @{{ result.user.username }}<template v-if="result.user.host">@{{ result.user.host }}</template>
          </span>
        </div>
        <i class="ti ti-chevron-right lookup-user-arrow" />
      </button>
    </div>
  </DeckColumn>

  <Teleport to="body">
    <MkPostForm
      v-if="showPostForm && column.accountId"
      :account-id="column.accountId"
      :reply-to="postFormReplyTo"
      :renote-id="postFormRenoteId"
      :edit-note="postFormEditNote"
      @close="closePostForm"
      @posted="handlePosted"
    />
  </Teleport>
</template>

<style scoped>
.lookup-header-icon {
  flex-shrink: 0;
  opacity: 0.7;
}

.header-account {
  display: flex;
  align-items: center;
  gap: 4px;
  margin-left: 4px;
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

.lookup-bar {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 12px;
  border-bottom: 1px solid var(--nd-divider);
  background: var(--nd-bg);
}

.lookup-icon {
  flex-shrink: 0;
  opacity: 0.4;
}

.lookup-input {
  flex: 1;
  min-width: 0;
  background: var(--nd-buttonBg);
  border: none;
  border-radius: var(--nd-radius-sm);
  padding: 6px 10px;
  font-size: 0.85em;
  color: var(--nd-fg);
  outline: none;
}

.lookup-input:focus {
  box-shadow: 0 0 0 2px var(--nd-accent);
}

.lookup-input::placeholder {
  color: var(--nd-fg);
  opacity: 0.4;
}

.lookup-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border-radius: var(--nd-radius-sm);
  flex-shrink: 0;
  opacity: 0.6;
  transition: opacity 0.15s, background 0.15s;
}

.lookup-btn:hover:not(:disabled) {
  background: var(--nd-buttonHoverBg);
  opacity: 1;
}

.lookup-btn:disabled {
  opacity: 0.2;
}

.lookup-result {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  scrollbar-color: var(--nd-scrollbarHandle) transparent;
  scrollbar-width: thin;
}

.lookup-user-card {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  padding: 16px 20px;
  transition: background 0.15s;
}

.lookup-user-card:hover {
  background: var(--nd-panelHighlight);
}

.lookup-user-avatar {
  width: 48px;
  height: 48px;
  border-radius: 50%;
  object-fit: cover;
  flex-shrink: 0;
}

.lookup-user-info {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.lookup-user-name {
  font-weight: bold;
  font-size: 0.95em;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.lookup-user-handle {
  font-size: 0.8em;
  opacity: 0.6;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.lookup-user-arrow {
  flex-shrink: 0;
  opacity: 0.3;
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
</style>
