<script setup lang="ts">
import { nextTick, ref, shallowRef } from 'vue'
import type { DeckColumn } from '@/stores/deck'
import DeckColumnComponent from './DeckColumn.vue'

const props = defineProps<{
  column: DeckColumn
}>()

interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: Date
}

const input = ref('')
const inputRef = ref<HTMLTextAreaElement | null>(null)
const messages = shallowRef<ChatMessage[]>([])
const isGenerating = ref(false)
const messagesEndRef = ref<HTMLElement | null>(null)
const providerStatus = ref<'connected' | 'disconnected' | 'checking'>('checking')

// TODO: Replace with actual Ollama/OpenAI integration
async function checkProvider() {
  providerStatus.value = 'checking'
  try {
    const res = await fetch('http://localhost:11434/api/tags')
    providerStatus.value = res.ok ? 'connected' : 'disconnected'
  } catch {
    providerStatus.value = 'disconnected'
  }
}

checkProvider()

function scrollToBottom() {
  nextTick(() => {
    messagesEndRef.value?.scrollIntoView({ behavior: 'smooth' })
  })
}

async function sendMessage() {
  const text = input.value.trim()
  if (!text || isGenerating.value) return

  const userMsg: ChatMessage = {
    id: `msg-${Date.now()}`,
    role: 'user',
    content: text,
    timestamp: new Date(),
  }

  messages.value = [...messages.value, userMsg]
  input.value = ''
  scrollToBottom()

  isGenerating.value = true

  // TODO: Replace with actual LLM API call
  await new Promise((r) => setTimeout(r, 800))

  const assistantMsg: ChatMessage = {
    id: `msg-${Date.now()}`,
    role: 'assistant',
    content: `[Mock] AI 応答のプレビューです。実際の Ollama / OpenAI 統合は Phase 6-1 で実装されます。\n\n入力: "${text}"`,
    timestamp: new Date(),
  }

  messages.value = [...messages.value, assistantMsg]
  isGenerating.value = false
  scrollToBottom()
}

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault()
    sendMessage()
  }
}
</script>

<template>
  <DeckColumnComponent :column-id="column.id" :title="column.name || 'AI Chat'">
    <template #header-icon>
      <i class="ti ti-sparkles" />
    </template>

    <template #header-meta>
      <span
        class="provider-dot"
        :class="providerStatus"
        :title="providerStatus === 'connected' ? 'Ollama 接続中' : '未接続'"
      />
    </template>

    <div class="ai-column-body">
      <!-- Messages -->
      <div class="ai-messages">
        <div v-if="messages.length === 0" class="ai-empty">
          <div class="ai-empty-icon">
            <i class="ti ti-sparkles" />
          </div>
          <span class="ai-empty-title">AI Chat</span>
          <span class="ai-empty-hint">質問を入力してください</span>
          <div class="ai-suggestions">
            <button class="_button ai-suggestion" @click="input = 'TL を要約して'; sendMessage()">
              TL を要約して
            </button>
            <button class="_button ai-suggestion" @click="input = '最近の通知をまとめて'; sendMessage()">
              通知をまとめて
            </button>
            <button class="_button ai-suggestion" @click="input = '今日の話題は？'; sendMessage()">
              今日の話題は？
            </button>
          </div>
        </div>

        <template v-else>
          <div
            v-for="msg in messages"
            :key="msg.id"
            class="ai-message"
            :class="msg.role"
          >
            <div class="message-avatar">
              <i v-if="msg.role === 'assistant'" class="ti ti-sparkles" />
              <i v-else class="ti ti-user" />
            </div>
            <div class="message-body">
              <div class="message-content">{{ msg.content }}</div>
            </div>
          </div>

          <div v-if="isGenerating" class="ai-message assistant">
            <div class="message-avatar">
              <i class="ti ti-sparkles" />
            </div>
            <div class="message-body">
              <div class="message-typing">
                <span class="typing-dot" />
                <span class="typing-dot" />
                <span class="typing-dot" />
              </div>
            </div>
          </div>
        </template>

        <div ref="messagesEndRef" />
      </div>

      <!-- Input -->
      <div class="ai-input-area">
        <textarea
          ref="inputRef"
          v-model="input"
          class="ai-input"
          placeholder="AI に質問..."
          rows="1"
          :disabled="providerStatus === 'disconnected'"
          @keydown="onKeydown"
        />
        <button
          class="_button ai-send"
          :disabled="!input.trim() || isGenerating || providerStatus === 'disconnected'"
          @click="sendMessage"
        >
          <i class="ti ti-send" />
        </button>
      </div>
    </div>
  </DeckColumnComponent>
</template>

<style scoped>
.provider-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  flex-shrink: 0;
}

.provider-dot.connected {
  background: var(--nd-accent);
}

.provider-dot.checking {
  background: var(--nd-warn, #e5a400);
}

.provider-dot.disconnected {
  background: #888;
}

.ai-column-body {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
}

.ai-messages {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 12px;
  scrollbar-color: var(--nd-scrollbarHandle) transparent;
  scrollbar-width: thin;
}

.ai-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  height: 100%;
  color: var(--nd-fg);
}

.ai-empty-icon {
  font-size: 2.5em;
  opacity: 0.15;
}

.ai-empty-title {
  font-weight: bold;
  font-size: 1.1em;
  opacity: 0.6;
}

.ai-empty-hint {
  font-size: 0.8em;
  opacity: 0.35;
}

.ai-suggestions {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 12px;
  justify-content: center;
}

.ai-suggestion {
  padding: 6px 12px;
  border-radius: 999px;
  background: var(--nd-buttonBg);
  font-size: 0.78em;
  opacity: 0.7;
  transition: opacity 0.15s, background 0.15s;
}

.ai-suggestion:hover {
  background: var(--nd-buttonHoverBg);
  opacity: 1;
}

.ai-message {
  display: flex;
  gap: 8px;
  margin-bottom: 12px;
}

.ai-message.user {
  flex-direction: row-reverse;
}

.message-avatar {
  flex-shrink: 0;
  width: 26px;
  height: 26px;
  border-radius: 50%;
  background: var(--nd-buttonBg);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 0.75em;
  opacity: 0.6;
}

.ai-message.assistant .message-avatar {
  background: color-mix(in srgb, var(--nd-accent) 15%, transparent);
  color: var(--nd-accent);
  opacity: 1;
}

.message-body {
  max-width: 85%;
  min-width: 0;
}

.message-content {
  padding: 8px 12px;
  border-radius: 12px;
  font-size: 0.83em;
  line-height: 1.5;
  white-space: pre-wrap;
  word-break: break-word;
}

.ai-message.user .message-content {
  background: var(--nd-accent);
  color: var(--nd-fgOnAccent, #fff);
  border-bottom-right-radius: 4px;
}

.ai-message.assistant .message-content {
  background: var(--nd-buttonBg);
  border-bottom-left-radius: 4px;
}

.message-typing {
  display: flex;
  gap: 4px;
  padding: 10px 14px;
  background: var(--nd-buttonBg);
  border-radius: 12px;
  border-bottom-left-radius: 4px;
}

.typing-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--nd-fg);
  opacity: 0.3;
  animation: typing 1.2s infinite ease-in-out;
}

.typing-dot:nth-child(2) {
  animation-delay: 0.2s;
}

.typing-dot:nth-child(3) {
  animation-delay: 0.4s;
}

@keyframes typing {
  0%, 60%, 100% { opacity: 0.3; transform: translateY(0); }
  30% { opacity: 0.8; transform: translateY(-3px); }
}

.ai-input-area {
  display: flex;
  align-items: flex-end;
  gap: 6px;
  padding: 8px 12px;
  border-top: 1px solid var(--nd-divider);
  flex-shrink: 0;
}

.ai-input {
  flex: 1;
  min-width: 0;
  background: var(--nd-buttonBg);
  border: none;
  border-radius: 8px;
  padding: 8px 10px;
  font-size: 0.83em;
  color: var(--nd-fg);
  outline: none;
  resize: none;
  max-height: 100px;
  font-family: inherit;
}

.ai-input:focus {
  box-shadow: 0 0 0 2px var(--nd-accent);
}

.ai-input::placeholder {
  color: var(--nd-fg);
  opacity: 0.4;
}

.ai-input:disabled {
  opacity: 0.4;
}

.ai-send {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 30px;
  border-radius: 8px;
  background: var(--nd-accent);
  color: var(--nd-fgOnAccent, #fff);
  flex-shrink: 0;
  transition: opacity 0.15s, transform 0.15s;
}

.ai-send:hover:not(:disabled) {
  transform: scale(1.05);
}

.ai-send:disabled {
  opacity: 0.3;
}
</style>
