<script setup lang="ts">
import { invoke } from '@tauri-apps/api/core'
import {
  computed,
  nextTick,
  onMounted,
  onUnmounted,
  ref,
  shallowRef,
} from 'vue'
import type {
  AvatarDecoration,
  ChatMessage,
  NormalizedDriveFile,
} from '@/adapters/types'
import MkAvatar from '@/components/common/MkAvatar.vue'
import MkChatMessage from '@/components/common/MkChatMessage.vue'
import MkReactionPicker from '@/components/common/MkReactionPicker.vue'
import { useMultiAccountAdapters } from '@/composables/useMultiAccountAdapters'
import { useAccountsStore } from '@/stores/accounts'
import { formatTime } from '@/utils/formatTime'

const accountsStore = useAccountsStore()
const { getOrCreate } = useMultiAccountAdapters()

const viewMode = ref<'history' | 'conversation'>('history')
const isLoading = ref(false)
const error = ref<string | null>(null)

// Progress dots (same pattern as NotificationsContent)
const loadProgress = ref<{ host: string; done: boolean }[]>([])

// --- History ---
interface HistoryEntry {
  key: string
  accountId: string
  serverHost: string
  message: ChatMessage
  isRoom: boolean
  name: string
  avatarUrl?: string
  avatarDecorations?: AvatarDecoration[]
  otherId?: string
  roomId?: string
}

const historyEntries = shallowRef<HistoryEntry[]>([])

function getMyUserId(accountId: string): string | undefined {
  return accountsStore.accounts.find((a) => a.id === accountId)?.userId
}

async function loadHistory() {
  const accounts = accountsStore.accounts
  if (accounts.length === 0) return

  isLoading.value = true
  error.value = null

  loadProgress.value = accounts.map((acc) => ({
    host: acc.host,
    done: false,
  }))

  const results = await Promise.allSettled(
    accounts.map(async (acc, i) => {
      const adapter = await getOrCreate(acc.id)
      if (!adapter) return []
      try {
        const userHistory = await adapter.api.getChatHistory()
        let roomHistory: ChatMessage[] = []
        try {
          roomHistory = await invoke<ChatMessage[]>('api_request', {
            accountId: acc.id,
            endpoint: 'chat/history',
            params: { limit: 100, room: true },
          })
        } catch {
          // room chat not supported
        }
        return [...userHistory, ...roomHistory].map((msg) => ({
          msg,
          accountId: acc.id,
          host: acc.host,
        }))
      } finally {
        loadProgress.value = loadProgress.value.map((p, j) =>
          j === i ? { ...p, done: true } : p,
        )
      }
    }),
  )

  const entries: HistoryEntry[] = []
  const seen = new Set<string>()

  // Collect all messages and sort by time
  const allMessages: { msg: ChatMessage; accountId: string; host: string }[] =
    []
  for (const r of results) {
    if (r.status === 'fulfilled') allMessages.push(...r.value)
  }
  allMessages.sort(
    (a, b) =>
      new Date(b.msg.createdAt).getTime() - new Date(a.msg.createdAt).getTime(),
  )

  for (const { msg, accountId, host } of allMessages) {
    const myUserId = getMyUserId(accountId)
    if (msg.toRoomId) {
      const key = `${accountId}:room:${msg.toRoomId}`
      if (seen.has(key)) continue
      seen.add(key)
      entries.push({
        key,
        accountId,
        serverHost: host,
        message: msg,
        isRoom: true,
        name: msg.toRoom?.name || 'Room',
        avatarUrl: msg.fromUser?.avatarUrl ?? undefined,
        avatarDecorations: msg.fromUser?.avatarDecorations,
        roomId: msg.toRoomId,
      })
    } else {
      const otherId =
        msg.fromUserId === myUserId ? msg.toUserId : msg.fromUserId
      if (!otherId) continue
      const key = `${accountId}:user:${otherId}`
      if (seen.has(key)) continue
      seen.add(key)
      const other = msg.fromUserId === myUserId ? msg.toUser : msg.fromUser
      entries.push({
        key,
        accountId,
        serverHost: host,
        message: msg,
        isRoom: false,
        name: other?.name || other?.username || otherId,
        avatarUrl: other?.avatarUrl ?? undefined,
        avatarDecorations: other?.avatarDecorations,
        otherId,
      })
    }
  }

  historyEntries.value = entries

  if (entries.length === 0) {
    error.value = 'No conversations'
  }

  isLoading.value = false
  loadProgress.value = []
}

// --- Conversation ---
const messages = shallowRef<ChatMessage[]>([])
const conversationTitle = ref('')
const conversationAccountId = ref<string | null>(null)
const conversationServerHost = ref<string | null>(null)
const currentOtherId = ref<string | null>(null)
const currentRoomId = ref<string | null>(null)
const messageText = ref('')
const isSending = ref(false)
const showEmojiPicker = ref(false)
const attachedFile = ref<NormalizedDriveFile | null>(null)
const isUploading = ref(false)
const fileInput = ref<HTMLInputElement | null>(null)
const textareaRef = ref<HTMLTextAreaElement | null>(null)
const messagesContainer = ref<HTMLElement | null>(null)

let chatSub: { dispose: () => void } | null = null

const myUserId = computed(() => {
  if (!conversationAccountId.value) return undefined
  return getMyUserId(conversationAccountId.value)
})

async function openConversation(entry: HistoryEntry) {
  const adapter = await getOrCreate(entry.accountId)
  if (!adapter) return

  chatSub?.dispose()
  chatSub = null

  conversationTitle.value = entry.name
  conversationAccountId.value = entry.accountId
  conversationServerHost.value = entry.serverHost
  isLoading.value = true
  error.value = null

  try {
    if (entry.isRoom && entry.roomId) {
      currentRoomId.value = entry.roomId
      currentOtherId.value = null
      const msgs = await adapter.api.getChatRoomMessages(entry.roomId)
      messages.value = msgs.slice().reverse()
      adapter.stream.connect()
      chatSub = adapter.stream.subscribeChatRoom(entry.roomId, onNewMessage, {
        onDeleted: onMessageDeleted,
      })
    } else if (entry.otherId) {
      currentOtherId.value = entry.otherId
      currentRoomId.value = null
      const msgs = await adapter.api.getChatUserMessages(entry.otherId)
      messages.value = msgs.slice().reverse()
      adapter.stream.connect()
      chatSub = adapter.stream.subscribeChatUser(entry.otherId, onNewMessage, {
        onDeleted: onMessageDeleted,
      })
    }
    viewMode.value = 'conversation'
    scrollToBottom()
  } catch (e) {
    error.value = String(e)
  } finally {
    isLoading.value = false
  }
}

function onNewMessage(msg: ChatMessage) {
  if (messages.value.some((m) => m.id === msg.id)) return
  messages.value = [...messages.value, msg]
  scrollToBottom()
}

function onMessageDeleted(messageId: string) {
  messages.value = messages.value.filter((m) => m.id !== messageId)
}

function goBack() {
  chatSub?.dispose()
  chatSub = null
  viewMode.value = 'history'
  messages.value = []
  currentOtherId.value = null
  currentRoomId.value = null
  conversationAccountId.value = null
  conversationServerHost.value = null
}

// --- Send ---
const canSend = computed(() => {
  if (isSending.value || isUploading.value) return false
  return messageText.value.trim().length > 0 || attachedFile.value !== null
})

async function sendMessage() {
  if (!canSend.value || !conversationAccountId.value) return

  isSending.value = true
  try {
    const params: Record<string, unknown> = {
      text: messageText.value.trim() || undefined,
    }
    if (currentOtherId.value) params.userId = currentOtherId.value
    if (currentRoomId.value) params.roomId = currentRoomId.value
    if (attachedFile.value) params.fileId = attachedFile.value.id

    const sent = await invoke<ChatMessage>('api_request', {
      accountId: conversationAccountId.value,
      endpoint: 'messaging/messages/create',
      params,
    })
    messageText.value = ''
    attachedFile.value = null
    if (!messages.value.some((m) => m.id === sent.id)) {
      messages.value = [...messages.value, sent]
      scrollToBottom()
    }
  } catch (e) {
    error.value = String(e)
  } finally {
    isSending.value = false
  }
}

function handleKeydown(e: KeyboardEvent) {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault()
    sendMessage()
  }
}

// --- Emoji ---
function pickEmoji(reaction: string) {
  const textarea = textareaRef.value
  if (textarea) {
    const start = textarea.selectionStart
    const end = textarea.selectionEnd
    messageText.value =
      messageText.value.slice(0, start) +
      reaction +
      messageText.value.slice(end)
    nextTick(() => {
      const pos = start + reaction.length
      textarea.setSelectionRange(pos, pos)
      textarea.focus()
    })
  } else {
    messageText.value += reaction
  }
  showEmojiPicker.value = false
}

// --- File ---
function openFilePicker() {
  fileInput.value?.click()
}

async function onFileSelected(e: Event) {
  const input = e.target as HTMLInputElement
  const files = input.files
  if (!files || !files[0] || !conversationAccountId.value) return

  const adapter = await getOrCreate(conversationAccountId.value)
  if (!adapter) return

  isUploading.value = true
  try {
    const file = files[0]
    const buffer = await file.arrayBuffer()
    const data = Array.from(new Uint8Array(buffer))
    attachedFile.value = await adapter.api.uploadFile(
      file.name,
      data,
      file.type || 'application/octet-stream',
    )
  } catch (e) {
    error.value = String(e)
  } finally {
    isUploading.value = false
    input.value = ''
  }
}

function removeAttachment() {
  attachedFile.value = null
}

// --- Reactions ---
const reactionTargetId = ref<string | null>(null)
const showReactionPicker = ref(false)

async function handleReact(messageId: string, reaction: string) {
  if (!conversationAccountId.value) return

  if (!reaction) {
    reactionTargetId.value = messageId
    showReactionPicker.value = true
    return
  }

  try {
    await invoke('api_request', {
      accountId: conversationAccountId.value,
      endpoint: 'chat/messages/react',
      params: { messageId, reaction },
    })
    updateMessageReaction(messageId, reaction, true)
  } catch (e) {
    error.value = String(e)
  }
}

async function handleUnreact(messageId: string, reaction: string) {
  if (!conversationAccountId.value) return

  try {
    await invoke('api_request', {
      accountId: conversationAccountId.value,
      endpoint: 'chat/messages/unreact',
      params: { messageId, reaction },
    })
    updateMessageReaction(messageId, reaction, false)
  } catch (e) {
    error.value = String(e)
  }
}

function pickReaction(reaction: string) {
  if (reactionTargetId.value) {
    handleReact(reactionTargetId.value, reaction)
  }
  closeReactionPicker()
}

function closeReactionPicker() {
  showReactionPicker.value = false
  showEmojiPicker.value = false
  reactionTargetId.value = null
}

function updateMessageReaction(
  messageId: string,
  reaction: string,
  add: boolean,
) {
  const acc = conversationAccountId.value
    ? accountsStore.accounts.find((a) => a.id === conversationAccountId.value)
    : null
  if (!acc) return

  messages.value = messages.value.map((msg) => {
    if (msg.id !== messageId) return msg
    const reactions = [...(msg.reactions ?? [])]
    if (add) {
      reactions.push({
        user: {
          id: acc.userId ?? '',
          username: acc.username ?? '',
          name: acc.displayName ?? undefined,
          avatarUrl: acc.avatarUrl ?? undefined,
        },
        reaction,
      })
    } else {
      const idx = reactions.findIndex(
        (r) => r.reaction === reaction && r.user?.id === acc.userId,
      )
      if (idx >= 0) reactions.splice(idx, 1)
    }
    return { ...msg, reactions }
  })
}

// --- Scroll ---
function scrollToBottom() {
  requestAnimationFrame(() => {
    const el = messagesContainer.value
    if (el) el.scrollTop = el.scrollHeight
  })
}

async function loadOlder() {
  if (
    !conversationAccountId.value ||
    isLoading.value ||
    messages.value.length === 0
  )
    return
  const adapter = await getOrCreate(conversationAccountId.value)
  if (!adapter) return

  const oldest = messages.value[0]
  if (!oldest) return
  isLoading.value = true
  try {
    let older: ChatMessage[]
    if (currentRoomId.value) {
      older = await adapter.api.getChatRoomMessages(currentRoomId.value, {
        untilId: oldest.id,
      })
    } else if (currentOtherId.value) {
      older = await adapter.api.getChatUserMessages(currentOtherId.value, {
        untilId: oldest.id,
      })
    } else {
      return
    }
    if (older.length > 0) {
      messages.value = [...older.slice().reverse(), ...messages.value]
    }
  } catch (e) {
    error.value = String(e)
  } finally {
    isLoading.value = false
  }
}

function handleScroll() {
  const el = messagesContainer.value
  if (!el) return
  if (el.scrollTop < 100) {
    loadOlder()
  }
}

onMounted(() => {
  loadHistory()
})

onUnmounted(() => {
  chatSub?.dispose()
  chatSub = null
})
</script>

<template>
  <div :class="$style.chatContent" @click="closeReactionPicker">
    <!-- Per-account progress -->
    <div v-if="loadProgress.length > 0" :class="$style.chatProgress">
      <span
        v-for="(p, i) in loadProgress"
        :key="i"
        :class="[$style.progressDot, { [$style.done]: p.done }]"
        :title="p.host"
      />
    </div>

    <!-- History View -->
    <template v-if="viewMode === 'history'">
      <div
        v-if="isLoading && historyEntries.length === 0 && loadProgress.length === 0"
        :class="$style.chatEmpty"
      >
        Loading...
      </div>

      <div
        v-else-if="error && historyEntries.length === 0"
        :class="$style.chatEmpty"
      >
        <div :class="$style.chatEmptyIcon">
          <i class="ti ti-messages" />
        </div>
        <span>{{ error }}</span>
      </div>

      <div v-else :class="$style.historyList">
        <button
          v-for="entry in historyEntries"
          :key="entry.key"
          :class="$style.historyItem"
          @click="openConversation(entry)"
        >
          <MkAvatar
            v-if="entry.avatarUrl"
            :avatar-url="entry.avatarUrl"
            :decorations="entry.avatarDecorations ?? []"
            :size="36"
          />
          <div v-else :class="$style.historyAvatarPlaceholder">
            <i :class="entry.isRoom ? 'ti ti-users' : 'ti ti-user'" />
          </div>
          <div :class="$style.historyInfo">
            <div :class="$style.historyName">{{ entry.name }}</div>
            <div :class="$style.historyPreview">{{ entry.message.text || '(file)' }}</div>
          </div>
          <div :class="$style.historyMeta">
            <span :class="$style.historyHost">{{ entry.serverHost }}</span>
            <span :class="$style.historyTime">{{ formatTime(entry.message.createdAt) }}</span>
          </div>
        </button>
      </div>
    </template>

    <!-- Conversation View -->
    <template v-else>
      <div :class="$style.convHeader">
        <button :class="$style.convBack" @click="goBack">
          <i class="ti ti-arrow-left" />
        </button>
        <span :class="$style.convTitle">{{ conversationTitle }}</span>
        <span v-if="conversationServerHost" :class="$style.convHost">{{ conversationServerHost }}</span>
      </div>

      <div
        ref="messagesContainer"
        :class="$style.messagesContainer"
        @scroll.passive="handleScroll"
      >
        <div v-if="isLoading" :class="$style.loadingMore">Loading...</div>
        <MkChatMessage
          v-for="msg in messages"
          :key="msg.id"
          :message="msg"
          :my-user-id="myUserId"
          :account-id="conversationAccountId ?? undefined"
          :server-host="conversationServerHost ?? undefined"
          @react="handleReact"
          @unreact="handleUnreact"
        />
      </div>

      <div v-if="error" :class="$style.chatError">{{ error }}</div>

      <!-- Reaction picker popup -->
      <div v-if="showReactionPicker && conversationAccountId && conversationServerHost" :class="$style.chatReactionPicker" @click.stop>
        <MkReactionPicker
          :server-host="conversationServerHost"
          :account-id="conversationAccountId"
          @pick="pickReaction"
        />
      </div>

      <div :class="$style.chatInput">
        <!-- File attachment preview -->
        <div v-if="attachedFile" :class="$style.chatAttachment">
          <img
            v-if="attachedFile.type.startsWith('image/')"
            :src="attachedFile.thumbnailUrl || attachedFile.url"
            :class="$style.chatAttachmentThumb"
          />
          <span v-else :class="$style.chatAttachmentName">{{ attachedFile.name }}</span>
          <button :class="$style.chatAttachmentRemove" @click="removeAttachment">
            <i class="ti ti-x" />
          </button>
        </div>
        <div v-if="isUploading" :class="$style.chatUploading">
          <i :class="['ti', 'ti-loader-2', $style.spin]" /> Uploading...
        </div>
        <div :class="$style.chatInputRow">
          <div :class="$style.chatInputActions">
            <button :class="$style.chatActionBtn" title="ファイル" @click="openFilePicker">
              <i class="ti ti-photo" />
            </button>
            <button :class="$style.chatActionBtn" title="絵文字" @click.stop="showEmojiPicker = !showEmojiPicker">
              <i class="ti ti-mood-happy" />
            </button>
          </div>
          <textarea
            ref="textareaRef"
            v-model="messageText"
            :class="$style.chatTextarea"
            placeholder="メッセージ..."
            rows="1"
            @keydown="handleKeydown"
          />
          <button
            :class="$style.chatSend"
            :disabled="!canSend"
            @click="sendMessage"
          >
            <i class="ti ti-send" />
          </button>
        </div>
        <!-- Emoji picker popup -->
        <div v-if="showEmojiPicker && conversationAccountId && conversationServerHost" :class="$style.chatEmojiPopup" @click.stop>
          <MkReactionPicker
            :server-host="conversationServerHost"
            :account-id="conversationAccountId"
            @pick="pickEmoji"
          />
        </div>
        <input
          ref="fileInput"
          type="file"
          style="display: none"
          accept="image/*,video/*,audio/*"
          @change="onFileSelected"
        />
      </div>
    </template>
  </div>
</template>

<style lang="scss" module>
.chatContent {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
}

.chatProgress {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 6px 12px;
  flex-shrink: 0;
}

.progressDot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--nd-fg);
  opacity: 0.15;
  transition: opacity var(--nd-duration-slower), background var(--nd-duration-slower);

  &.done {
    background: var(--nd-accent);
    opacity: 0.8;
  }
}

.chatEmpty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 2rem 1rem;
  color: var(--nd-fg);
  opacity: 0.5;
  font-size: 0.85em;
}

.chatEmptyIcon {
  font-size: 2em;
  opacity: 0.3;
}

.historyList {
  flex: 1;
  overflow-y: auto;
  scrollbar-color: var(--nd-scrollbarHandle) transparent;
  scrollbar-width: thin;
}

.historyItem {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 10px 16px;
  border: none;
  background: none;
  color: var(--nd-fg);
  text-align: left;
  cursor: pointer;
  border-bottom: 1px solid var(--nd-divider);

  &:hover {
    background: var(--nd-panelHighlight, rgba(255, 255, 255, 0.03));
  }

  :deep(.mk-avatar) {
    flex-shrink: 0;
  }

  :deep(.mk-avatar:hover) {
    transform: none;
  }
}

.historyAvatarPlaceholder {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  background: var(--nd-buttonBg, rgba(255, 255, 255, 0.1));
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  opacity: 0.5;
}

.historyInfo {
  flex: 1;
  min-width: 0;
}

.historyName {
  font-size: 0.9em;
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.historyPreview {
  font-size: 0.8em;
  opacity: 0.5;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  margin-top: 2px;
}

.historyMeta {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 2px;
  flex-shrink: 0;
}

.historyHost {
  font-size: 0.7em;
  opacity: 0.35;
  max-width: 80px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.historyTime {
  font-size: 0.75em;
  opacity: 0.5;
}

.convHeader {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  border-bottom: 1px solid var(--nd-divider);
  flex-shrink: 0;
}

.convBack {
  background: none;
  border: none;
  color: var(--nd-fg);
  cursor: pointer;
  padding: 4px;
  opacity: 0.7;
  font-size: 1.1em;

  &:hover {
    opacity: 1;
  }
}

.convTitle {
  font-weight: 600;
  font-size: 0.9em;
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.convHost {
  font-size: 0.7em;
  opacity: 0.35;
}

.messagesContainer {
  flex: 1;
  overflow-y: auto;
  overflow-x: hidden;
  padding: 8px 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
  scrollbar-color: var(--nd-scrollbarHandle) transparent;
  scrollbar-width: thin;
}

.loadingMore {
  text-align: center;
  padding: 1rem;
  font-size: 0.8em;
  opacity: 0.4;
}

.chatError {
  padding: 4px 12px;
  font-size: 0.8em;
  color: var(--nd-love);
}

.chatInput {
  display: flex;
  flex-direction: column;
  padding: 6px 8px 8px;
  border-top: 1px solid var(--nd-divider);
  background: var(--nd-panel);
  position: relative;
  flex-shrink: 0;
}

.chatAttachment {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 8px;
  margin-bottom: 4px;
  background: var(--nd-panelHighlight, rgba(255, 255, 255, 0.05));
  border-radius: var(--nd-radius-md);
}

.chatAttachmentThumb {
  width: 48px;
  height: 48px;
  border-radius: var(--nd-radius-sm);
  object-fit: cover;
}

.chatAttachmentName {
  font-size: 0.8em;
  opacity: 0.7;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  flex: 1;
}

.chatAttachmentRemove {
  background: none;
  border: none;
  color: var(--nd-fg);
  opacity: 0.5;
  cursor: pointer;
  padding: 4px;
  font-size: 0.9em;

  &:hover {
    opacity: 1;
  }
}

.chatUploading {
  font-size: 0.8em;
  opacity: 0.5;
  padding: 2px 8px 4px;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.spin {
  animation: spin 1s linear infinite;
}

.chatInputRow {
  display: flex;
  align-items: flex-end;
  gap: 6px;
}

.chatInputActions {
  display: flex;
  gap: 2px;
  flex-shrink: 0;
}

.chatActionBtn {
  width: 32px;
  height: 32px;
  border: none;
  background: none;
  color: var(--nd-fg);
  opacity: 0.5;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  font-size: 1.1em;

  &:hover {
    opacity: 0.8;
    background: var(--nd-panelHighlight, rgba(255, 255, 255, 0.05));
  }
}

.chatTextarea {
  flex: 1;
  resize: none;
  border: none;
  background: var(--nd-panelHighlight, rgba(255, 255, 255, 0.05));
  color: var(--nd-fg);
  border-radius: 10px;
  padding: 8px 12px;
  font-size: 0.9em;
  font-family: inherit;
  line-height: 1.4;
  max-height: 120px;
  outline: none;
  field-sizing: content;

  &::placeholder {
    opacity: 0.4;
  }
}

.chatSend {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  border: none;
  background: var(--nd-accent);
  color: var(--nd-fgOnAccent, #fff);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  font-size: 1em;

  &:disabled {
    opacity: 0.3;
    cursor: default;
  }

  &:not(:disabled):hover {
    filter: brightness(1.1);
  }
}

.chatEmojiPopup {
  position: absolute;
  bottom: 100%;
  left: 0;
  right: 0;
  max-height: 320px;
  overflow: auto;
  background: var(--nd-popup);
  border-radius: 12px 12px 0 0;
  box-shadow: 0 -4px 16px rgba(0, 0, 0, 0.3);
  z-index: var(--nd-z-menu);
}

.chatReactionPicker {
  flex-shrink: 0;
  max-height: 280px;
  overflow: auto;
  border-top: 1px solid var(--nd-divider);
  background: var(--nd-panel);
}

/* Empty placeholder classes for dynamic binding */
.done {}
</style>
