<script setup lang="ts">
import { nextTick, ref, shallowRef } from 'vue'

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
const providerStatus = ref<'connected' | 'disconnected' | 'checking'>(
  'checking',
)

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
  // Mock response for UI testing
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

// Auto-focus
setTimeout(() => inputRef.value?.focus(), 100)
</script>

<template>
  <div class="ai-content">
    <!-- Provider status -->
    <div class="ai-status-bar">
      <span
        class="status-dot"
        :class="providerStatus"
      />
      <span class="status-text">
        {{ providerStatus === 'connected' ? 'Ollama' : providerStatus === 'checking' ? '接続確認中...' : '未接続' }}
      </span>
      <button
        v-if="providerStatus === 'disconnected'"
        class="_button status-retry"
        @click="checkProvider"
      >
        <i class="ti ti-refresh" />
      </button>
    </div>

    <!-- Messages area -->
    <div class="ai-messages">
      <div v-if="messages.length === 0" class="ai-empty">
        <div class="ai-empty-icon">
          <i class="ti ti-sparkles" />
        </div>
        <span class="ai-empty-title">AI アシスタント</span>
        <span class="ai-empty-hint">質問を入力してください</span>
        <div class="ai-suggestions">
          <button class="_button ai-suggestion" @click="input = 'TL を要約して'; sendMessage()">
            TL を要約して
          </button>
          <button class="_button ai-suggestion" @click="input = '最近の通知をまとめて'; sendMessage()">
            最近の通知をまとめて
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

    <!-- Input area -->
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
</template>

<style scoped>
.ai-content {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
}

.ai-status-bar {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  border-bottom: 1px solid var(--nd-divider);
  font-size: 0.75em;
  flex-shrink: 0;
}

.status-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  flex-shrink: 0;
}

.status-dot.connected {
  background: var(--nd-accent);
}

.status-dot.checking {
  background: var(--nd-warn, #e5a400);
}

.status-dot.disconnected {
  background: var(--nd-switchOffFg, #888);
}

.status-text {
  opacity: 0.6;
}

.status-retry {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  border-radius: 4px;
  opacity: 0.5;
  margin-left: auto;
}

.status-retry:hover {
  background: var(--nd-buttonHoverBg);
  opacity: 1;
}

/* Messages */
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
  font-size: 0.8em;
  opacity: 0.7;
  transition: opacity 0.15s, background 0.15s;
}

.ai-suggestion:hover {
  background: var(--nd-buttonHoverBg);
  opacity: 1;
}

/* Message bubbles */
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
  width: 28px;
  height: 28px;
  border-radius: 50%;
  background: var(--nd-buttonBg);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 0.8em;
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
  font-size: 0.85em;
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

/* Typing indicator */
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

/* Input */
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
  font-size: 0.85em;
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
  width: 32px;
  height: 32px;
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

@media (max-width: 500px) {
  .ai-input-area {
    padding: 8px;
    padding-bottom: calc(8px + var(--nd-safe-area-bottom, env(safe-area-inset-bottom)));
  }

  .ai-input {
    padding: 10px 12px;
    font-size: 1em;
  }

  .ai-send {
    width: 40px;
    height: 40px;
  }

  .status-retry {
    width: 36px;
    height: 36px;
  }

  .ai-suggestion {
    padding: 10px 14px;
    min-height: 44px;
  }
}
</style>
