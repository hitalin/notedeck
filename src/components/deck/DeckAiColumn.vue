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
  <DeckColumnComponent :column-id="column.id" :title="column.name || 'AIチャット'">
    <template #header-icon>
      <i class="ti ti-sparkles" />
    </template>

    <template #header-meta>
      <span
        :class="[$style.providerDot, $style[providerStatus]]"
        :title="providerStatus === 'connected' ? 'Ollama 接続中' : '未接続'"
      />
    </template>

    <div :class="$style.aiColumnBody">
      <!-- Messages -->
      <div :class="$style.aiMessages">
        <div v-if="messages.length === 0" :class="$style.aiEmpty">
          <div :class="$style.aiEmptyIcon">
            <i class="ti ti-sparkles" />
          </div>
          <span :class="$style.aiEmptyTitle">AI Chat</span>
          <span :class="$style.aiEmptyHint">質問を入力してください</span>
          <div :class="$style.aiSuggestions">
            <button class="_button" :class="$style.aiSuggestion" @click="input = 'TL を要約して'; sendMessage()">
              TL を要約して
            </button>
            <button class="_button" :class="$style.aiSuggestion" @click="input = '最近の通知をまとめて'; sendMessage()">
              通知をまとめて
            </button>
            <button class="_button" :class="$style.aiSuggestion" @click="input = '今日の話題は？'; sendMessage()">
              今日の話題は？
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

      <!-- Input -->
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
  </DeckColumnComponent>
</template>

<style lang="scss" module>
.providerDot {
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

.aiColumnBody {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
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
  font-size: 0.78em;
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
  }
}

.messageAvatar {
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

  .assistant & {
    background: var(--nd-accent-hover);
    color: var(--nd-accent);
    opacity: 1;
  }
}

.messageBody {
  max-width: 85%;
  min-width: 0;
}

.messageContent {
  padding: 8px 12px;
  border-radius: 12px;
  font-size: 0.83em;
  line-height: 1.5;
  white-space: pre-wrap;
  word-break: break-word;

  .user & {
    background: var(--nd-accent);
    color: var(--nd-fgOnAccent, #fff);
    border-bottom-right-radius: 4px;
  }

  .assistant & {
    background: var(--nd-buttonBg);
    border-bottom-left-radius: 4px;
  }
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
  font-size: 0.83em;
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
  width: 30px;
  height: 30px;
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
</style>
