import { type Ref, ref } from 'vue'
import type { NormalizedUser } from '@/adapters/types'
import { invoke } from '@/utils/tauriInvoke'

export function useMentionSearch(activeAccountId: Ref<string>) {
  const showMentionPopup = ref(false)
  const mentionQuery = ref('')
  const mentionResults = ref<NormalizedUser[]>([])
  const mentionSearching = ref(false)
  let mentionDebounceTimer: ReturnType<typeof setTimeout> | null = null

  function toggleMentionPopup() {
    showMentionPopup.value = !showMentionPopup.value
    if (showMentionPopup.value) {
      mentionQuery.value = ''
      mentionResults.value = []
    }
  }

  function onMentionInput() {
    if (mentionDebounceTimer) clearTimeout(mentionDebounceTimer)
    const q = mentionQuery.value.trim()
    if (!q) {
      mentionResults.value = []
      return
    }
    mentionDebounceTimer = setTimeout(async () => {
      if (!activeAccountId.value) return
      mentionSearching.value = true
      try {
        mentionResults.value = await invoke<NormalizedUser[]>(
          'api_search_users_by_query',
          {
            accountId: activeAccountId.value,
            query: q,
            limit: 10,
          },
        )
      } catch {
        mentionResults.value = []
      } finally {
        mentionSearching.value = false
      }
    }, 150)
  }

  function pickMention(
    user: NormalizedUser,
    insertAtCursor: (
      textarea: HTMLTextAreaElement | null,
      text: string,
    ) => void,
    textareaRef: Ref<HTMLTextAreaElement | null>,
  ) {
    const mention = user.host
      ? `@${user.username}@${user.host} `
      : `@${user.username} `
    insertAtCursor(textareaRef.value, mention)
    showMentionPopup.value = false
  }

  return {
    showMentionPopup,
    mentionQuery,
    mentionResults,
    mentionSearching,
    toggleMentionPopup,
    onMentionInput,
    pickMention,
  }
}
