<script setup lang="ts">
import { invoke } from '@tauri-apps/api/core'
import {
  computed,
  nextTick,
  onBeforeUnmount,
  onMounted,
  ref,
  shallowRef,
} from 'vue'
import type {
  AvatarDecoration,
  ChannelSubscription,
  ChatMessage,
  NormalizedDriveFile,
} from '@/adapters/types'
import MkAvatar from '@/components/common/MkAvatar.vue'
import MkChatMessage from '@/components/common/MkChatMessage.vue'
import MkReactionPicker from '@/components/common/MkReactionPicker.vue'
import MkSkeleton from '@/components/common/MkSkeleton.vue'
import { useColumnSetup } from '@/composables/useColumnSetup'
import { useNoteSound } from '@/composables/useNoteSound'
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
} = useColumnSetup(() => props.column)

const chatSound = useNoteSound(() => account.value?.host, 'syuilo/waon')

const viewMode = ref<'history' | 'conversation'>('history')
const chatHistory = shallowRef<ChatMessage[]>([])
const messages = shallowRef<ChatMessage[]>([])
const currentOtherId = ref<string | null>(null)
const currentRoomId = ref<string | null>(null)
const conversationTitle = ref('')
const messageText = ref('')
const isSending = ref(false)
const showEmojiPicker = ref(false)
const attachedFile = ref<NormalizedDriveFile | null>(null)
const isUploading = ref(false)
const fileInput = ref<HTMLInputElement | null>(null)
const textareaRef = ref<HTMLTextAreaElement | null>(null)

let chatSub: ChannelSubscription | null = null

const myUserId = computed(() => {
  if (!account.value) return undefined
  return account.value.userId
})

async function connect() {
  error.value = null
  isLoading.value = true

  try {
    const adapter = await initAdapter()
    if (!adapter) return

    const userHistory = await adapter.api.getChatHistory()

    let roomHistory: ChatMessage[] = []
    if (props.column.accountId) {
      roomHistory = await invoke<ChatMessage[]>('api_request', {
        accountId: props.column.accountId,
        endpoint: 'chat/history',
        params: { limit: 100, room: true },
      })
    }

    chatHistory.value = [...userHistory, ...roomHistory].sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    )
  } catch (e) {
    error.value = AppError.from(e)
  } finally {
    isLoading.value = false
  }
}

function getHistoryEntries() {
  const seen = new Set<string>()
  const entries: {
    key: string
    message: ChatMessage
    isRoom: boolean
    name: string
    avatarUrl?: string
    avatarDecorations?: AvatarDecoration[]
  }[] = []

  for (const msg of chatHistory.value) {
    if (msg.toRoomId) {
      if (seen.has(`room:${msg.toRoomId}`)) continue
      seen.add(`room:${msg.toRoomId}`)
      entries.push({
        key: `room:${msg.toRoomId}`,
        message: msg,
        isRoom: true,
        name: msg.toRoom?.name || 'Room',
        avatarUrl: msg.fromUser?.avatarUrl ?? undefined,
        avatarDecorations: msg.fromUser?.avatarDecorations,
      })
    } else {
      const otherId =
        msg.fromUserId === myUserId.value ? msg.toUserId : msg.fromUserId
      if (!otherId || seen.has(`user:${otherId}`)) continue
      seen.add(`user:${otherId}`)
      const other =
        msg.fromUserId === myUserId.value ? msg.toUser : msg.fromUser
      entries.push({
        key: `user:${otherId}`,
        message: msg,
        isRoom: false,
        name: other?.name || other?.username || otherId,
        avatarUrl: other?.avatarUrl ?? undefined,
        avatarDecorations: other?.avatarDecorations,
      })
    }
  }

  return entries
}

async function openConversation(
  entry: ReturnType<typeof getHistoryEntries>[0],
) {
  const adapter = getAdapter()
  if (!adapter) return

  chatSub?.dispose()
  chatSub = null

  conversationTitle.value = entry.name
  isLoading.value = true
  error.value = null

  try {
    if (entry.isRoom) {
      currentRoomId.value = entry.message.toRoomId ?? ''
      currentOtherId.value = null
      const msgs = await adapter.api.getChatRoomMessages(currentRoomId.value)
      messages.value = msgs.slice().reverse()
      chatSub = adapter.stream.subscribeChatRoom(
        currentRoomId.value,
        onNewMessage,
        { onDeleted: onMessageDeleted },
      )
    } else {
      const otherId =
        entry.message.fromUserId === myUserId.value
          ? (entry.message.toUserId ?? '')
          : entry.message.fromUserId
      currentOtherId.value = otherId
      currentRoomId.value = null
      const msgs = await adapter.api.getChatUserMessages(otherId)
      messages.value = msgs.slice().reverse()
      chatSub = adapter.stream.subscribeChatUser(otherId, onNewMessage, {
        onDeleted: onMessageDeleted,
      })
    }
    viewMode.value = 'conversation'
    scrollToBottom()
  } catch (e) {
    error.value = AppError.from(e)
  } finally {
    isLoading.value = false
  }
}

function onNewMessage(msg: ChatMessage) {
  if (messages.value.some((m) => m.id === msg.id)) return
  messages.value = [...messages.value, msg]
  if (!props.column.soundMuted) chatSound.play()
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
}

const canSend = computed(() => {
  if (isSending.value || isUploading.value) return false
  return messageText.value.trim().length > 0 || attachedFile.value !== null
})

async function sendMessage() {
  if (!canSend.value || !props.column.accountId) return

  isSending.value = true
  try {
    const params: Record<string, unknown> = {
      text: messageText.value.trim() || undefined,
    }
    if (currentOtherId.value) params.userId = currentOtherId.value
    if (currentRoomId.value) params.roomId = currentRoomId.value
    if (attachedFile.value) params.fileId = attachedFile.value.id

    const sent = await invoke<ChatMessage>('api_request', {
      accountId: props.column.accountId,
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
    error.value = AppError.from(e)
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

function openFilePicker() {
  fileInput.value?.click()
}

async function onFileSelected(e: Event) {
  const input = e.target as HTMLInputElement
  const files = input.files
  const adapter = getAdapter()
  if (!files || !files[0] || !adapter) return

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
    error.value = AppError.from(e)
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
  if (!props.column.accountId) return

  if (!reaction) {
    // Empty reaction = open picker
    reactionTargetId.value = messageId
    showReactionPicker.value = true
    return
  }

  try {
    await invoke('api_request', {
      accountId: props.column.accountId,
      endpoint: 'chat/messages/react',
      params: { messageId, reaction },
    })
    // Optimistically add reaction to local state
    updateMessageReaction(messageId, reaction, true)
  } catch (e) {
    error.value = AppError.from(e)
  }
}

async function handleUnreact(messageId: string, reaction: string) {
  if (!props.column.accountId) return

  try {
    await invoke('api_request', {
      accountId: props.column.accountId,
      endpoint: 'chat/messages/unreact',
      params: { messageId, reaction },
    })
    updateMessageReaction(messageId, reaction, false)
  } catch (e) {
    error.value = AppError.from(e)
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
  const acc = account.value
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

const messagesContainer = ref<HTMLElement | null>(null)
function scrollToBottom() {
  requestAnimationFrame(() => {
    const el = messagesContainer.value
    if (el) el.scrollTop = el.scrollHeight
  })
}

async function loadOlder() {
  const adapter = getAdapter()
  if (!adapter || isLoading.value || messages.value.length === 0) return
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
    error.value = AppError.from(e)
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

function scrollToTop(smooth = false) {
  const el = messagesContainer.value
  if (el) el.scrollTo({ top: 0, behavior: smooth ? 'smooth' : 'instant' })
}

onMounted(() => {
  connect()
})

onBeforeUnmount(() => {
  chatSub?.dispose()
  chatSub = null
})
</script>

<template>
  <DeckColumn
    :column-id="column.id"
    :title="viewMode === 'conversation' ? conversationTitle : (column.name || 'チャット')"
    :theme-vars="columnThemeVars"
    @header-click="scrollToTop(true)"
  >
    <template #header-icon>
      <i
        v-if="viewMode === 'conversation'"
        class="ti ti-arrow-left tl-header-icon clickable"
        @click.stop="goBack"
      />
      <i v-else class="ti ti-messages tl-header-icon" />
    </template>

    <template #header-meta>
      <div v-if="account" class="header-account">
        <img v-if="account.avatarUrl" :src="account.avatarUrl" class="header-avatar" />
        <img
          class="header-favicon"
          :src="serverIconUrl || `https://${account.host}/favicon.ico`"
          :title="account.host"
        />
      </div>
    </template>

    <div v-if="!account" class="column-empty">
      Account not found
    </div>

    <div v-else-if="error && viewMode === 'history'" class="column-empty column-error">
      {{ error.message }}
    </div>

    <!-- History View -->
    <div v-else-if="viewMode === 'history'" class="chat-body">
      <div v-if="isLoading && chatHistory.length === 0">
        <MkSkeleton v-for="i in 5" :key="i" />
      </div>

      <div v-else-if="chatHistory.length === 0" class="column-empty">
        No conversations
      </div>

      <div v-else class="history-list">
        <button
          v-for="entry in getHistoryEntries()"
          :key="entry.key"
          class="history-item"
          @click="openConversation(entry)"
        >
          <MkAvatar
            v-if="entry.avatarUrl"
            :avatar-url="entry.avatarUrl"
            :decorations="entry.avatarDecorations ?? []"
            :size="36"
          />
          <div v-else class="history-avatar-placeholder">
            <i :class="entry.isRoom ? 'ti ti-users' : 'ti ti-user'" />
          </div>
          <div class="history-info">
            <div class="history-name">{{ entry.name }}</div>
            <div class="history-preview">{{ entry.message.text || '(file)' }}</div>
          </div>
        </button>
      </div>
    </div>

    <!-- Conversation View -->
    <div v-else class="chat-body conversation" @click="closeReactionPicker">
      <div
        ref="messagesContainer"
        class="messages-container"
        @scroll.passive="handleScroll"
      >
        <div v-if="isLoading" class="loading-more">読み込み中...</div>
        <MkChatMessage
          v-for="msg in messages"
          :key="msg.id"
          :message="msg"
          :my-user-id="myUserId"
          :account-id="column.accountId ?? undefined"
          :server-host="account?.host"
          @react="handleReact"
          @unreact="handleUnreact"
        />
      </div>

      <div v-if="error" class="chat-error">{{ error.message }}</div>

      <!-- Reaction picker popup -->
      <div v-if="showReactionPicker && account" class="chat-reaction-picker" @click.stop>
        <MkReactionPicker
          :server-host="account.host"
          :account-id="column.accountId!"
          @pick="pickReaction"
        />
      </div>

      <div class="chat-input">
        <!-- File attachment preview -->
        <div v-if="attachedFile" class="chat-attachment">
          <img
            v-if="attachedFile.type.startsWith('image/')"
            :src="attachedFile.thumbnailUrl || attachedFile.url"
            class="chat-attachment-thumb"
          />
          <span v-else class="chat-attachment-name">{{ attachedFile.name }}</span>
          <button class="chat-attachment-remove" @click="removeAttachment">
            <i class="ti ti-x" />
          </button>
        </div>
        <div v-if="isUploading" class="chat-uploading">
          <i class="ti ti-loader-2 spin" /> アップロード中...
        </div>
        <div class="chat-input-row">
          <div class="chat-input-actions">
            <button class="chat-action-btn" title="ファイル" @click="openFilePicker">
              <i class="ti ti-photo" />
            </button>
            <button class="chat-action-btn" title="絵文字" @click.stop="showEmojiPicker = !showEmojiPicker">
              <i class="ti ti-mood-happy" />
            </button>
          </div>
          <textarea
            ref="textareaRef"
            v-model="messageText"
            class="chat-textarea"
            placeholder="メッセージ..."
            rows="1"
            @keydown="handleKeydown"
          />
          <button
            class="chat-send"
            :disabled="!canSend"
            @click="sendMessage"
          >
            <i class="ti ti-send" />
          </button>
        </div>
        <!-- Emoji picker popup -->
        <div v-if="showEmojiPicker && account" class="chat-emoji-popup" @click.stop>
          <MkReactionPicker
            :server-host="account.host"
            :account-id="column.accountId!"
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
    </div>
  </DeckColumn>
</template>

<style scoped>
.tl-header-icon {
  flex-shrink: 0;
  opacity: 0.7;
}

.tl-header-icon.clickable {
  cursor: pointer;
  opacity: 0.8;
}

.tl-header-icon.clickable:hover {
  opacity: 1;
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

.chat-body {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.chat-body.conversation {
  overflow: hidden;
}

.history-list {
  flex: 1;
  overflow-y: auto;
  scrollbar-color: var(--nd-scrollbarHandle) transparent;
  scrollbar-width: thin;
}

.history-item {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 10px 12px;
  border: none;
  background: none;
  color: var(--nd-fg);
  text-align: left;
  cursor: pointer;
  border-bottom: 1px solid var(--nd-divider, rgba(255, 255, 255, 0.05));
}

.history-item:hover {
  background: var(--nd-panelHighlight, rgba(255, 255, 255, 0.03));
}

.history-item :deep(.mk-avatar) {
  flex-shrink: 0;
}

.history-item :deep(.mk-avatar:hover) {
  transform: none;
}

.history-avatar-placeholder {
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

.history-info {
  flex: 1;
  min-width: 0;
}

.history-name {
  font-size: 0.9em;
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.history-preview {
  font-size: 0.8em;
  opacity: 0.5;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  margin-top: 2px;
}

.messages-container {
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

.chat-error {
  padding: 4px 12px;
  font-size: 0.8em;
  color: var(--nd-love);
}

.chat-input {
  display: flex;
  flex-direction: column;
  padding: 6px 8px 8px;
  border-top: 1px solid var(--nd-divider, rgba(255, 255, 255, 0.05));
  background: var(--nd-panel);
  position: relative;
}

.chat-attachment {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 8px;
  margin-bottom: 4px;
  background: var(--nd-panelHighlight, rgba(255, 255, 255, 0.05));
  border-radius: 8px;
}

.chat-attachment-thumb {
  width: 48px;
  height: 48px;
  border-radius: 6px;
  object-fit: cover;
}

.chat-attachment-name {
  font-size: 0.8em;
  opacity: 0.7;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  flex: 1;
}

.chat-attachment-remove {
  background: none;
  border: none;
  color: var(--nd-fg);
  opacity: 0.5;
  cursor: pointer;
  padding: 4px;
  font-size: 0.9em;
}

.chat-attachment-remove:hover {
  opacity: 1;
}

.chat-uploading {
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

.chat-input-row {
  display: flex;
  align-items: flex-end;
  gap: 6px;
}

.chat-input-actions {
  display: flex;
  gap: 2px;
  flex-shrink: 0;
}

.chat-action-btn {
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
}

.chat-action-btn:hover {
  opacity: 0.8;
  background: var(--nd-panelHighlight, rgba(255, 255, 255, 0.05));
}

.chat-textarea {
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
}

.chat-textarea::placeholder {
  opacity: 0.4;
}

.chat-send {
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
}

.chat-send:disabled {
  opacity: 0.3;
  cursor: default;
}

.chat-send:not(:disabled):hover {
  filter: brightness(1.1);
}

.chat-emoji-popup {
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

.chat-reaction-picker {
  flex-shrink: 0;
  max-height: 280px;
  overflow: auto;
  border-top: 1px solid var(--nd-divider, rgba(255, 255, 255, 0.05));
  background: var(--nd-panel);
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
