<script setup lang="ts">
import { computed, nextTick, ref, useTemplateRef, watch } from 'vue'
import { type ChatMessage, useAiChat } from '@/composables/useAiChat'
import {
  getApiKeyStatus,
  type ProviderKey,
  useAiConfig,
} from '@/composables/useAiConfig'
import { useAiConversation } from '@/composables/useAiConversation'
import type { DeckColumn } from '@/stores/deck'
import { useSkillsStore } from '@/stores/skills'
import { renderSimpleMarkdown } from '@/utils/simpleMarkdown'
import DeckColumnComponent from './DeckColumn.vue'

const props = defineProps<{
  column: DeckColumn
}>()

const input = ref('')
const inputRef = ref<HTMLTextAreaElement | null>(null)
const messagesEndRef = ref<HTMLElement | null>(null)
const providerStatus = ref<'connected' | 'disconnected' | 'checking'>(
  'checking',
)

const skillsStore = useSkillsStore()
skillsStore.ensureLoaded()
const activeSkillCount = computed(() => skillsStore.effectiveActiveIds.length)

const { config: aiConfig } = useAiConfig()
const aiChat = useAiChat()
const conversation = useAiConversation(props.column.id)

const messages = conversation.messages
const isGenerating = aiChat.isStreaming

const currentProviderLabel = computed(() => {
  switch (aiConfig.value.provider) {
    case 'anthropic':
      return 'Anthropic Claude'
    case 'openai':
      return 'OpenAI ChatGPT'
    case 'custom':
      return 'カスタムプロバイダー'
    default:
      return 'AI'
  }
})

const providerTooltip = computed(() => {
  if (providerStatus.value === 'checking') return '確認中...'
  if (providerStatus.value === 'connected') {
    return `${currentProviderLabel.value} 接続準備 OK`
  }
  return 'API キー未設定 / エンドポイント未設定'
})

async function checkProvider(): Promise<void> {
  providerStatus.value = 'checking'
  try {
    const provider: ProviderKey = aiConfig.value.provider
    const settings = aiConfig.value[provider]
    if (!settings.endpoint || !settings.model) {
      providerStatus.value = 'disconnected'
      return
    }
    if (provider === 'custom') {
      // Custom: API key is optional (e.g. self-hosted endpoints)
      providerStatus.value = 'connected'
      return
    }
    const hasKey = await getApiKeyStatus(provider)
    providerStatus.value = hasKey ? 'connected' : 'disconnected'
  } catch {
    providerStatus.value = 'disconnected'
  }
}

watch(
  () => [
    aiConfig.value.provider,
    aiConfig.value[aiConfig.value.provider]?.endpoint,
    aiConfig.value[aiConfig.value.provider]?.model,
  ],
  () => {
    void checkProvider()
  },
  { immediate: true },
)

function scrollToBottom() {
  nextTick(() => {
    messagesEndRef.value?.scrollIntoView({ behavior: 'smooth' })
  })
}

// Stream deltas → update last assistant message in-place
watch(aiChat.currentText, (text) => {
  if (!aiChat.isStreaming.value || !text) return
  const last = messages.value[messages.value.length - 1]
  if (last?.role === 'assistant') {
    conversation.replaceLast({ ...last, content: text })
  }
  scrollToBottom()
})

async function sendMessage() {
  const text = input.value.trim()
  if (!text || aiChat.isStreaming.value) return
  if (providerStatus.value !== 'connected') return

  const provider: ProviderKey = aiConfig.value.provider
  const settings = aiConfig.value[provider]

  const now = Date.now()
  const userMsg: ChatMessage = {
    id: `msg-${now}-u`,
    role: 'user',
    content: text,
    timestamp: now,
  }
  conversation.append(userMsg)
  input.value = ''
  scrollToBottom()

  // Pre-add empty assistant placeholder so streaming has a target slot
  const assistantMsg: ChatMessage = {
    id: `msg-${now}-a`,
    role: 'assistant',
    content: '',
    timestamp: now,
  }
  conversation.append(assistantMsg)
  scrollToBottom()

  // Build wire history: exclude the empty placeholder, exclude any system msgs
  const history = messages.value.filter(
    (m) => m.role !== 'system' && m.id !== assistantMsg.id,
  )

  const system = skillsStore.composedSystemPrompt() || undefined

  try {
    const finalText = await aiChat.sendMessage({
      provider,
      endpoint: settings.endpoint,
      model: settings.model,
      history,
      system,
    })
    // Ensure final text is persisted (last delta may have been before reactivity flushed)
    const last = messages.value[messages.value.length - 1]
    if (last?.role === 'assistant' && last.content !== finalText) {
      conversation.replaceLast({ ...last, content: finalText })
    }
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    const last = messages.value[messages.value.length - 1]
    if (last?.role === 'assistant') {
      conversation.replaceLast({
        ...last,
        content: `⚠️ ${message}`,
      })
    }
  }
  scrollToBottom()
}

function clearConversation() {
  conversation.clear()
}

// --- Copy to clipboard ---

const copiedMessageId = ref<string | null>(null)

async function copyMessage(msg: ChatMessage) {
  try {
    await navigator.clipboard.writeText(msg.content)
    copiedMessageId.value = msg.id
    setTimeout(() => {
      if (copiedMessageId.value === msg.id) copiedMessageId.value = null
    }, 1500)
  } catch (e) {
    console.warn('[ai-chat] copy failed:', e)
  }
}

// --- Markdown rendering (assistant messages only) ---

function renderAssistant(content: string): string {
  return renderSimpleMarkdown(content)
}

// --- Auto-resize input textarea ---

const INPUT_MAX_HEIGHT = 160

function adjustInputHeight() {
  const el = inputRef.value
  if (!el) return
  el.style.height = 'auto'
  el.style.height = `${Math.min(el.scrollHeight, INPUT_MAX_HEIGHT)}px`
}

watch(input, () => nextTick(adjustInputHeight))

const aiMessagesRef = useTemplateRef<HTMLElement>('aiMessagesRef')

function scrollToTop() {
  aiMessagesRef.value?.scrollTo({ top: 0, behavior: 'smooth' })
}

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault()
    sendMessage()
  }
}
</script>

<template>
  <DeckColumnComponent :column-id="column.id" :title="column.name || 'AIチャット'" @header-click="scrollToTop">
    <template #header-icon>
      <i class="ti ti-brain" />
    </template>

    <template #header-meta>
      <span
        v-if="activeSkillCount > 0"
        :class="$style.skillCount"
        :title="`${activeSkillCount} 個のスキルが有効`"
      >
        <i class="ti ti-sparkles" />
        {{ activeSkillCount }}
      </span>
      <button
        v-if="messages.length > 0"
        class="_button"
        :class="$style.headerAction"
        title="会話をクリア"
        @click="clearConversation"
      >
        <i class="ti ti-trash" />
      </button>
      <span
        :class="[$style.providerDot, $style[providerStatus]]"
        :title="providerTooltip"
      />
    </template>

    <div :class="$style.aiColumnBody">
      <!-- Messages -->
      <div ref="aiMessagesRef" :class="$style.aiMessages">
        <div v-if="messages.length === 0" :class="$style.aiEmpty">
          <div :class="$style.aiEmptyIcon">
            <svg :class="$style.aiSignIcon" viewBox="0 0 500 300" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
              <g transform="matrix(1,0,0,1,0,-822.52)">
                <g transform="matrix(0.678544,0,0,0.678544,75.2996,401.189)">
                  <path d="M301.271,941.862L308.01,937.525M126.688,1005.21C108.505,987.528 77.382,989.437 73.654,1007.73C68.898,1031.08 106.782,1040.24 128.203,1028.44C151.103,1015.83 224.341,907.088 253.967,916.312C279.544,924.276 236.794,1023.39 236.794,1023.39C236.794,1023.39 168.043,929.904 134.769,960.759C106.99,986.518 194.368,1029.45 236.794,1023.39C273.16,1023.89 296.898,958.738 296.898,958.738C296.898,958.738 278.21,1011.77 317.606,1013.79C357.002,1015.81 438.783,962.575 414.581,947.627C397.408,937.02 363.568,967.83 363.568,967.83C363.568,967.83 372.487,922.311 347.911,938.03C329.301,949.934 335.79,1000.18 365.589,1003.69C382.835,1010.45 409.126,1007.16 428.246,998.581C499.435,966.651 498.47,810.412 419.575,760.939L390.1,694.621L353.257,746.202C309.563,725.858 244.295,720.675 204.409,740.307L183.776,672.514L139.564,746.202C51.735,803.663 56.171,883.374 95.352,930.419" />
                </g>
                <g transform="matrix(0.678544,0,0,0.678544,72.5861,413.246)">
                  <path d="M199.143,802.119L205.882,768.308" />
                </g>
                <g transform="matrix(0.678544,0,0,0.678544,147.586,414.717)">
                  <path d="M202.513,807.32L205.882,768.308" />
                </g>
                <g transform="matrix(0.678544,0,0,0.678544,77.5861,398.246)">
                  <path d="M268.831,846.331L246.725,868.437L231.988,846.331" />
                </g>
              </g>
            </svg>
          </div>
          <span :class="$style.aiEmptyTitle">AI Chat</span>
          <span :class="$style.aiEmptyHint">
            {{ providerStatus === 'connected'
              ? `${currentProviderLabel} と会話できます`
              : 'AI 設定で API キーを設定してください' }}
          </span>
          <div v-if="providerStatus === 'connected'" :class="$style.aiSuggestions">
            <button class="_button" :class="$style.aiSuggestion" @click="input = '自己紹介して'; sendMessage()">
              自己紹介して
            </button>
            <button class="_button" :class="$style.aiSuggestion" @click="input = '俳句を 1 つ詠んで'; sendMessage()">
              俳句を詠んで
            </button>
            <button class="_button" :class="$style.aiSuggestion" @click="input = '励ましの言葉を'; sendMessage()">
              励ましの言葉を
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
              <i v-if="msg.role === 'assistant'" class="ti ti-brain" />
              <i v-else class="ti ti-user" />
            </div>
            <div :class="$style.messageBody">
              <div
                v-if="msg.role === 'assistant' && !msg.content && isGenerating"
                :class="$style.messageTyping"
              >
                <span :class="$style.typingDot" />
                <span :class="$style.typingDot" />
                <span :class="$style.typingDot" />
              </div>
              <div
                v-else-if="msg.role === 'assistant'"
                :class="[$style.messageContent, $style.markdownContent]"
                v-html="renderAssistant(msg.content)"
              />
              <div v-else :class="$style.messageContent">{{ msg.content }}</div>
              <button
                v-if="msg.role === 'assistant' && msg.content && !isGenerating"
                class="_button"
                :class="$style.copyBtn"
                :title="copiedMessageId === msg.id ? 'コピーしました' : 'コピー'"
                @click="copyMessage(msg)"
              >
                <i :class="copiedMessageId === msg.id ? 'ti ti-check' : 'ti ti-copy'" />
              </button>
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
          :placeholder="providerStatus === 'connected'
            ? `${currentProviderLabel} に質問...`
            : 'AI 設定で API キーを設定してください'"
          rows="1"
          :disabled="providerStatus !== 'connected'"
          @keydown="onKeydown"
        />
        <button
          class="_button"
          :class="$style.aiSend"
          :disabled="!input.trim() || isGenerating || providerStatus !== 'connected'"
          @click="sendMessage"
        >
          <i class="ti ti-send" />
        </button>
      </div>
    </div>
  </DeckColumnComponent>
</template>

<style lang="scss" module>
.aiSignIcon {
  display: block;
  width: 3em;
  height: auto;
  fill: none;
  stroke: currentColor;
  stroke-width: 14px;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.headerAction {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  margin-right: 4px;
  border-radius: var(--nd-radius-sm);
  opacity: 0.45;
  font-size: 0.9em;
  flex-shrink: 0;
  transition: opacity var(--nd-duration-base), background var(--nd-duration-base);

  &:hover {
    background: var(--nd-buttonHoverBg);
    opacity: 1;
  }
}

.skillCount {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  padding: 1px 6px;
  margin-right: 4px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--nd-accent) 14%, transparent);
  color: var(--nd-accent);
  font-size: 11px;
  flex-shrink: 0;
}

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
  opacity: 0.35;
  color: var(--nd-accent);
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
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  max-width: 85%;
  min-width: 0;
  gap: 4px;

  .user & {
    align-items: flex-end;
  }
}

.copyBtn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  border-radius: var(--nd-radius-sm);
  opacity: 0;
  font-size: 0.85em;
  transition: opacity var(--nd-duration-base), background var(--nd-duration-base);

  &:hover {
    background: var(--nd-buttonHoverBg);
    opacity: 1;
  }
}

.aiMessage:hover .copyBtn {
  opacity: 0.55;
}

.markdownContent {
  :global(p) {
    margin: 0;
  }
  :global(p + p) {
    margin-top: 0.5em;
  }
  :global(strong) {
    font-weight: bold;
  }
  :global(em) {
    font-style: italic;
  }
  :global(code.nd-md-inline-code) {
    padding: 1px 5px;
    border-radius: 3px;
    background: color-mix(in srgb, var(--nd-fg) 12%, transparent);
    font-family: var(--nd-font-mono, ui-monospace, SFMono-Regular, Menlo, monospace);
    font-size: 0.9em;
  }
  :global(pre.nd-md-code) {
    margin: 6px 0;
    padding: 8px 10px;
    border-radius: var(--nd-radius-sm);
    background: color-mix(in srgb, var(--nd-fg) 8%, transparent);
    overflow-x: auto;
    font-size: 0.85em;
    line-height: 1.45;

    code {
      font-family: var(--nd-font-mono, ui-monospace, SFMono-Regular, Menlo, monospace);
      background: transparent;
      padding: 0;
    }
  }
  :global(.nd-md-h) {
    margin: 8px 0 4px;
    font-weight: bold;
    font-size: 1em;
  }
  :global(ul),
  :global(ol) {
    margin: 4px 0;
    padding-left: 18px;
  }
  :global(li) {
    margin: 2px 0;
  }
  :global(a) {
    color: var(--nd-accent);
    text-decoration: underline;
    word-break: break-all;
  }
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
  line-height: 1.5;
  color: var(--nd-fg);
  outline: none;
  resize: none;
  max-height: 160px;
  overflow-y: auto;
  font-family: inherit;
  scrollbar-color: var(--nd-scrollbarHandle) transparent;
  scrollbar-width: thin;

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
