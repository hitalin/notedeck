import JSON5 from 'json5'
import { ref } from 'vue'
import type { ChatMessage } from '@/composables/useAiChat'
import {
  aiConversationFilename,
  deleteAiConversationFile,
  isTauri,
  readAiConversationFile,
  writeAiConversationFile,
} from '@/utils/settingsFs'

const MAX_MESSAGES = 200
const PERSIST_DEBOUNCE_MS = 500

interface PersistShape {
  messages: ChatMessage[]
}

/**
 * Per-column AI chat history backed by `notedeck/ai-conversations/<columnId>.json5`.
 *
 * Each column has its own independent conversation. Messages auto-save with
 * a debounce so rapid streaming doesn't hammer the disk.
 */
export function useAiConversation(columnId: string) {
  const messages = ref<ChatMessage[]>([])
  const loaded = ref(false)
  let persistTimer: ReturnType<typeof setTimeout> | null = null

  async function load(): Promise<void> {
    if (!isTauri) {
      loaded.value = true
      return
    }
    try {
      const raw = await readAiConversationFile(aiConversationFilename(columnId))
      if (raw) {
        const parsed = JSON5.parse(raw) as PersistShape
        if (Array.isArray(parsed.messages)) {
          messages.value = parsed.messages
        }
      }
    } catch (e) {
      // Missing file for a fresh column is expected — silent unless other error
      if (!String(e).toLowerCase().includes('no such file')) {
        console.warn('[ai-conversations] load failed:', e)
      }
    }
    loaded.value = true
  }

  function schedulePersist(): void {
    if (persistTimer) clearTimeout(persistTimer)
    persistTimer = setTimeout(() => {
      persistTimer = null
      void persist()
    }, PERSIST_DEBOUNCE_MS)
  }

  async function persist(): Promise<void> {
    if (!isTauri) return
    if (messages.value.length > MAX_MESSAGES) {
      messages.value = messages.value.slice(-MAX_MESSAGES)
    }
    const content = `${JSON5.stringify({ messages: messages.value }, null, 2)}\n`
    try {
      await writeAiConversationFile(aiConversationFilename(columnId), content)
    } catch (e) {
      console.warn('[ai-conversations] persist failed:', e)
    }
  }

  function append(msg: ChatMessage): void {
    messages.value = [...messages.value, msg]
    schedulePersist()
  }

  function replaceLast(msg: ChatMessage): void {
    if (messages.value.length === 0) {
      messages.value = [msg]
    } else {
      messages.value = [...messages.value.slice(0, -1), msg]
    }
    schedulePersist()
  }

  function clear(): void {
    messages.value = []
    schedulePersist()
  }

  async function deleteFile(): Promise<void> {
    if (persistTimer) {
      clearTimeout(persistTimer)
      persistTimer = null
    }
    messages.value = []
    if (!isTauri) return
    try {
      await deleteAiConversationFile(aiConversationFilename(columnId))
    } catch (e) {
      console.warn('[ai-conversations] delete failed:', e)
    }
  }

  void load()

  return {
    messages,
    loaded,
    append,
    replaceLast,
    clear,
    deleteFile,
  }
}
