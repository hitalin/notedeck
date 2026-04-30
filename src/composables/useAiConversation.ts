import { type ComputedRef, computed, type Ref, ref } from 'vue'
import type { ChatMessage } from '@/composables/useAiChat'
import { useAiSessionsStore } from '@/stores/aiSessions'

const MAX_MESSAGES = 200

/**
 * Pinia store の AiSession に対する薄いラッパー。`useAiSessionsStore` が
 * sessionId 単位で本文と debounce 永続化を集中管理するため、本 composable は
 * 「指定 sessionId のメッセージ配列を読んだり編集したりする」薄い API
 * を提供するだけ。
 *
 * `sessionIdRef` を ref で受け取ると、カラム側でセッション切替したときに
 * 自動的に新しいセッションを参照しに行く（複数カラムで同一セッションを
 * 開いても破綻しない）。
 */
export function useAiConversation(
  sessionIdRef: Ref<string | null> | ComputedRef<string | null>,
): {
  messages: ComputedRef<ChatMessage[]>
  loaded: Ref<boolean>
  append: (msg: ChatMessage) => void
  replaceLast: (msg: ChatMessage) => void
  clear: () => void
} {
  const store = useAiSessionsStore()
  // metaLoaded が false の間は loaded=false。store 側で並列の重複 load を防ぐ。
  const loaded = ref(store.metaLoaded)
  if (!store.metaLoaded) {
    void store.loadAllMeta().then(() => {
      loaded.value = true
    })
  }

  const messages = computed<ChatMessage[]>(() => {
    const id = sessionIdRef.value
    if (!id) return []
    return store.get(id)?.messages ?? []
  })

  function append(msg: ChatMessage): void {
    const id = sessionIdRef.value
    if (!id) return
    const cur = store.get(id)
    if (!cur) return
    let next = [...cur.messages, msg]
    if (next.length > MAX_MESSAGES) next = next.slice(-MAX_MESSAGES)
    store.updateMessages(id, next)
  }

  function replaceLast(msg: ChatMessage): void {
    const id = sessionIdRef.value
    if (!id) return
    const cur = store.get(id)
    if (!cur) return
    const next =
      cur.messages.length === 0 ? [msg] : [...cur.messages.slice(0, -1), msg]
    store.updateMessages(id, next)
  }

  function clear(): void {
    const id = sessionIdRef.value
    if (!id) return
    store.updateMessages(id, [])
  }

  return {
    messages,
    loaded,
    append,
    replaceLast,
    clear,
  }
}
