<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, shallowRef } from 'vue'
import type { ChannelSubscription, ChatMessage } from '@/adapters/types'
import MkChatMessage from '@/components/common/MkChatMessage.vue'
import MkSkeleton from '@/components/common/MkSkeleton.vue'
import { useColumnSetup } from '@/composables/useColumnSetup'
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

const viewMode = ref<'history' | 'conversation'>('history')
const chatHistory = shallowRef<ChatMessage[]>([])
const messages = shallowRef<ChatMessage[]>([])
const currentOtherId = ref<string | null>(null)
const currentRoomId = ref<string | null>(null)
const conversationTitle = ref('')
const messageText = ref('')
const isSending = ref(false)

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

    const history = await adapter.api.getChatHistory()
    chatHistory.value = history
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
      chatSub = adapter.stream.subscribeChatUser(otherId, onNewMessage)
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
  scrollToBottom()
}

function goBack() {
  chatSub?.dispose()
  chatSub = null
  viewMode.value = 'history'
  messages.value = []
  currentOtherId.value = null
  currentRoomId.value = null
}

async function sendMessage() {
  const adapter = getAdapter()
  if (!adapter || !messageText.value.trim() || isSending.value) return

  isSending.value = true
  try {
    const sent = await adapter.api.createChatMessage({
      userId: currentOtherId.value ?? undefined,
      roomId: currentRoomId.value ?? undefined,
      text: messageText.value.trim(),
    })
    messageText.value = ''
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
    :title="viewMode === 'conversation' ? conversationTitle : (column.name || 'Chat')"
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
          <img
            v-if="entry.avatarUrl"
            :src="entry.avatarUrl"
            class="history-avatar"
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
    <div v-else class="chat-body conversation">
      <div
        ref="messagesContainer"
        class="messages-container"
        @scroll.passive="handleScroll"
      >
        <div v-if="isLoading" class="loading-more">Loading...</div>
        <MkChatMessage
          v-for="msg in messages"
          :key="msg.id"
          :message="msg"
          :my-user-id="myUserId"
        />
      </div>

      <div v-if="error" class="chat-error">{{ error.message }}</div>

      <div class="chat-input">
        <textarea
          v-model="messageText"
          class="chat-textarea"
          placeholder="Message..."
          rows="1"
          @keydown="handleKeydown"
        />
        <button
          class="chat-send"
          :disabled="!messageText.trim() || isSending"
          @click="sendMessage"
        >
          <i class="ti ti-send" />
        </button>
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

.history-avatar {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  object-fit: cover;
  flex-shrink: 0;
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
  align-items: flex-end;
  gap: 6px;
  padding: 8px;
  border-top: 1px solid var(--nd-divider, rgba(255, 255, 255, 0.05));
  background: var(--nd-panel);
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
