import { onScopeDispose, type Ref, ref } from 'vue'
import type { NormalizedUser } from '@/adapters/types'
import { commands, unwrap } from '@/utils/tauriInvoke'

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
        mentionResults.value = unwrap(
          await commands.apiSearchUsersByQuery(activeAccountId.value, q, 10),
        ) as unknown as NormalizedUser[]
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

  onScopeDispose(() => {
    if (mentionDebounceTimer) {
      clearTimeout(mentionDebounceTimer)
      mentionDebounceTimer = null
    }
    mentionSearching.value = false
  })

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
