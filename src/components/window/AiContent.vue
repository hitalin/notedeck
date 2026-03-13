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
  <div :class="$style.aiContent">
    <!-- Provider status -->
    <div :class="$style.aiStatusBar">
      <span
        :class="[$style.statusDot, $style[providerStatus]]"
      />
      <span :class="$style.statusText">
        {{ providerStatus === 'connected' ? 'Ollama' : providerStatus === 'checking' ? '接続確認中...' : '未接続' }}
      </span>
      <button
        v-if="providerStatus === 'disconnected'"
        class="_button"
        :class="$style.statusRetry"
        @click="checkProvider"
      >
        <i class="ti ti-refresh" />
      </button>
    </div>

    <!-- Messages area -->
    <div :class="$style.aiMessages">
      <div v-if="messages.length === 0" :class="$style.aiEmpty">
        <div :class="$style.aiEmptyIcon">
          <i class="ti ti-sparkles" />
        </div>
        <span :class="$style.aiEmptyTitle">AI アシスタント</span>
        <span :class="$style.aiEmptyHint">質問を入力してください</span>
        <div :class="$style.aiSuggestions">
          <button class="_button" :class="$style.aiSuggestion" @click="input = 'TL を要約して'; sendMessage()">
            TL を要約して
          </button>
          <button class="_button" :class="$style.aiSuggestion" @click="input = '最近の通知をまとめて'; sendMessage()">
            最近の通知をまとめて
          </button>
        </div>
      </div>

      <template v-else>
        <div
          v-for="msg in messages"
          :key="msg.id"
          :class="[$style.aiMessage, $style[msg.role]]"
        >
          <div :class="$style.messageAvatar">
            <i v-if="msg.role === 'assistant'" class="ti ti-sparkles" />
            <i v-else class="ti ti-user" />
          </div>
          <div :class="$style.messageBody">
            <div :class="$style.messageContent">{{ msg.content }}</div>
          </div>
        </div>

        <div v-if="isGenerating" :class="[$style.aiMessage, $style.assistant]">
          <div :class="$style.messageAvatar">
            <i class="ti ti-sparkles" />
          </div>
          <div :class="$style.messageBody">
            <div :class="$style.messageTyping">
              <span :class="$style.typingDot" />
              <span :class="$style.typingDot" />
              <span :class="$style.typingDot" />
            </div>
          </div>
        </div>
      </template>

      <div ref="messagesEndRef" />
    </div>

    <!-- Input area -->
    <div :class="$style.aiInputArea">
      <textarea
        ref="inputRef"
        v-model="input"
        :class="$style.aiInput"
        placeholder="AI に質問..."
        rows="1"
        :disabled="providerStatus === 'disconnected'"
        @keydown="onKeydown"
      />
      <button
        class="_button"
        :class="$style.aiSend"
        :disabled="!input.trim() || isGenerating || providerStatus === 'disconnected'"
        @click="sendMessage"
      >
        <i class="ti ti-send" />
      </button>
    </div>
  </div>
</template>

<style lang="scss" module>
.aiContent {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
}

.aiStatusBar {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  border-bottom: 1px solid var(--nd-divider);
  font-size: 0.75em;
  flex-shrink: 0;
}

.statusDot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  flex-shrink: 0;

  &.connected {
    background: var(--nd-accent);
  }

  &.checking {
    background: var(--nd-warn, #e5a400);
  }

  &.disconnected {
    background: var(--nd-switchOffFg, #888);
  }
}

.statusText {
  opacity: 0.6;
}

.statusRetry {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  border-radius: 4px;
  opacity: 0.5;
  margin-left: auto;

  &:hover {
    background: var(--nd-buttonHoverBg);
    opacity: 1;
  }
}

.aiMessages {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 12px;
  scrollbar-color: var(--nd-scrollbarHandle) transparent;
  scrollbar-width: thin;
}

.aiEmpty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  height: 100%;
  color: var(--nd-fg);
}

.aiEmptyIcon {
  font-size: 2.5em;
  opacity: 0.15;
}

.aiEmptyTitle {
  font-weight: bold;
  font-size: 1.1em;
  opacity: 0.6;
}

.aiEmptyHint {
  font-size: 0.8em;
  opacity: 0.35;
}

.aiSuggestions {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 12px;
  justify-content: center;
}

.aiSuggestion {
  padding: 6px 12px;
  border-radius: var(--nd-radius-full);
  background: var(--nd-buttonBg);
  font-size: 0.8em;
  opacity: 0.7;
  transition: opacity var(--nd-duration-base), background var(--nd-duration-base);

  &:hover {
    background: var(--nd-buttonHoverBg);
    opacity: 1;
  }
}

.aiMessage {
  display: flex;
  gap: 8px;
  margin-bottom: 12px;

  &.user {
    flex-direction: row-reverse;

    .messageContent {
      background: var(--nd-accent);
      color: var(--nd-fgOnAccent, #fff);
      border-bottom-right-radius: 4px;
    }
  }

  &.assistant {
    .messageAvatar {
      background: var(--nd-accent-hover);
      color: var(--nd-accent);
      opacity: 1;
    }

    .messageContent {
      background: var(--nd-buttonBg);
      border-bottom-left-radius: 4px;
    }
  }
}

.messageAvatar {
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

.messageBody {
  max-width: 85%;
  min-width: 0;
}

.messageContent {
  padding: 8px 12px;
  border-radius: 12px;
  font-size: 0.85em;
  line-height: 1.5;
  white-space: pre-wrap;
  word-break: break-word;
}

.messageTyping {
  display: flex;
  gap: 4px;
  padding: 10px 14px;
  background: var(--nd-buttonBg);
  border-radius: 12px;
  border-bottom-left-radius: 4px;
}

.typingDot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--nd-fg);
  opacity: 0.3;
  animation: typing 1.2s infinite ease-in-out;

  &:nth-child(2) {
    animation-delay: 0.2s;
  }

  &:nth-child(3) {
    animation-delay: 0.4s;
  }
}

@keyframes typing {
  0%, 60%, 100% { opacity: 0.3; transform: translateY(0); }
  30% { opacity: 0.8; transform: translateY(-3px); }
}

.aiInputArea {
  display: flex;
  align-items: flex-end;
  gap: 6px;
  padding: 8px 12px;
  border-top: 1px solid var(--nd-divider);
  flex-shrink: 0;
}

.aiInput {
  flex: 1;
  min-width: 0;
  background: var(--nd-buttonBg);
  border: none;
  border-radius: var(--nd-radius-md);
  padding: 8px 10px;
  font-size: 0.85em;
  color: var(--nd-fg);
  outline: none;
  resize: none;
  max-height: 100px;
  font-family: inherit;

  &:focus {
    box-shadow: 0 0 0 2px var(--nd-accent);
  }

  &::placeholder {
    color: var(--nd-fg);
    opacity: 0.4;
  }

  &:disabled {
    opacity: 0.4;
  }
}

.aiSend {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border-radius: var(--nd-radius-md);
  background: var(--nd-accent);
  color: var(--nd-fgOnAccent, #fff);
  flex-shrink: 0;
  transition: opacity var(--nd-duration-base), transform var(--nd-duration-base);

  &:hover:not(:disabled) {
    transform: scale(1.05);
  }

  &:disabled {
    opacity: 0.3;
  }
}

@media (max-width: 500px) {
  .aiInputArea {
    padding: 8px;
    padding-bottom: calc(8px + var(--nd-safe-area-bottom, env(safe-area-inset-bottom)));
  }

  .aiInput {
    padding: 10px 12px;
    font-size: 1em;
  }

  .aiSend {
    width: 40px;
    height: 40px;
  }

  .statusRetry {
    width: 36px;
    height: 36px;
  }

  .aiSuggestion {
    padding: 10px 14px;
    min-height: 44px;
  }
}

:global(html.nd-mobile) {
  .aiInputArea {
    padding: 8px;
    padding-bottom: calc(8px + var(--nd-safe-area-bottom, env(safe-area-inset-bottom)));
  }

  .aiInput {
    padding: 10px 12px;
    font-size: 1em;
  }

  .aiSend {
    width: 40px;
    height: 40px;
  }

  .statusRetry {
    width: 36px;
    height: 36px;
  }

  .aiSuggestion {
    padding: 10px 14px;
    min-height: 44px;
  }
}

/* Empty placeholder classes for dynamic binding */
.connected {}
.checking {}
.disconnected {}
.user {}
.assistant {}
</style>
