import { type ComputedRef, computed, type Ref } from 'vue'
import type { ChatMessage } from '@/composables/useAiChat'
import { useAiSessionsStore } from '@/stores/aiSessions'

/**
 * 指定 sessionId のメッセージ配列に対する reactive な参照を提供する薄い
 * ラッパー。`useAiSessionsStore` が永続化と本文管理を担うので、本 composable
 * は ref 化された sessionId の変化を購読してメッセージ配列を切り替えるだけ。
 *
 * 書き込み (append / replaceLast / clear) は呼び出し側で
 * `useAiSessionsStore.updateMessages(sessionId, messages)` を直接使う想定。
 */
export function useAiConversation(
  sessionIdRef: Ref<string | null> | ComputedRef<string | null>,
): { messages: ComputedRef<ChatMessage[]> } {
  const store = useAiSessionsStore()
  if (!store.metaLoaded) void store.loadAllMeta()

  const messages = computed<ChatMessage[]>(() => {
    const id = sessionIdRef.value
    if (!id) return []
    return store.get(id)?.messages ?? []
  })

  return { messages }
}
