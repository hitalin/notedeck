import { listen, type UnlistenFn } from '@tauri-apps/api/event'
import { onScopeDispose, ref } from 'vue'
import type { AiChatMessage } from '@/bindings'
import { commands, unwrap } from '@/utils/tauriInvoke'

/** Single chat message stored in the conversation. */
export interface ChatMessage {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  timestamp: number
}

export interface AiChatSendOptions {
  provider: string
  endpoint: string
  model: string
  /** Conversation history (excluding the system prompt). */
  history: ChatMessage[]
  /** Composed system prompt (optional). */
  system?: string
  maxTokens?: number
}

interface AiChatEventPayload {
  stream_id: string
  kind: 'delta' | 'done' | 'error'
  text?: string
  error?: string
}

const EVENT_NAME = 'nd:ai-chat-event'

function generateStreamId(): string {
  return `ai-stream-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

function toWireMessage(m: ChatMessage): AiChatMessage {
  return { role: m.role, content: m.content }
}

/**
 * Single-shot streaming chat call. The accumulator ref is updated as deltas
 * arrive; the returned promise resolves with the final text on completion.
 *
 * Cancellation is not yet supported (planned for a follow-up PR).
 */
export function useAiChat() {
  const isStreaming = ref(false)
  const lastError = ref<string | null>(null)
  /** Live-updated assistant text for the current send. */
  const currentText = ref('')

  // Hoisted to composable scope so onScopeDispose can clean it up if the
  // component unmounts while a stream is in flight.
  let activeUnlisten: UnlistenFn | null = null

  function cleanup() {
    if (activeUnlisten) {
      activeUnlisten()
      activeUnlisten = null
    }
    isStreaming.value = false
  }

  // Auto-cleanup on component unmount: tears down any in-flight listener
  // so we don't leak across columns being added/removed.
  onScopeDispose(() => {
    if (activeUnlisten) {
      activeUnlisten()
      activeUnlisten = null
    }
  })

  async function sendMessage(opts: AiChatSendOptions): Promise<string> {
    if (isStreaming.value) {
      throw new Error('既に応答生成中です')
    }
    isStreaming.value = true
    lastError.value = null
    currentText.value = ''

    const streamId = generateStreamId()

    return new Promise<string>((resolve, reject) => {
      // Subscribe BEFORE invoking, so we never miss the first delta.
      listen<AiChatEventPayload>(EVENT_NAME, (event) => {
        const p = event.payload
        if (p.stream_id !== streamId) return
        if (p.kind === 'delta' && p.text) {
          currentText.value += p.text
        } else if (p.kind === 'done') {
          const finalText = currentText.value
          cleanup()
          resolve(finalText)
        } else if (p.kind === 'error') {
          const message = p.error ?? '不明なエラー'
          lastError.value = message
          cleanup()
          reject(new Error(message))
        }
      })
        .then((un) => {
          activeUnlisten = un
          return commands.aiChatSend({
            stream_id: streamId,
            provider: opts.provider,
            endpoint: opts.endpoint,
            model: opts.model,
            messages: opts.history.map(toWireMessage),
            system: opts.system && opts.system.length > 0 ? opts.system : null,
            max_tokens: opts.maxTokens ?? null,
          })
        })
        .then((res) => {
          unwrap(res)
        })
        .catch((e) => {
          const message = e instanceof Error ? e.message : String(e)
          lastError.value = message
          cleanup()
          reject(new Error(message))
        })
    })
  }

  return {
    isStreaming,
    lastError,
    currentText,
    sendMessage,
  }
}
