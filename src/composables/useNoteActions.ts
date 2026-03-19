import { ref } from 'vue'
import type { NormalizedNote, ServerAdapter } from '@/adapters/types'
import { useToast } from '@/stores/toast'
import { AppError } from '@/utils/errors'
import { toggleFavorite } from '@/utils/toggleFavorite'
import { toggleReaction } from '@/utils/toggleReaction'

/**
 * Reusable note action handlers (reaction, renote, reply, quote, delete, edit, bookmark).
 * Works with both single-adapter (column) and multi-adapter (cross-search) patterns.
 *
 * @param getAdapter - resolves the adapter for a given note (may be async for multi-account)
 * @param onMutated - called after optimistic mutation to trigger reactivity
 */
export function useNoteActions(
  getAdapter: (
    note: NormalizedNote,
  ) => ServerAdapter | null | Promise<ServerAdapter | null>,
  onMutated: (note: NormalizedNote) => void,
) {
  const toast = useToast()

  // Post form state
  const showPostForm = ref(false)
  const postFormReplyTo = ref<NormalizedNote | undefined>()
  const postFormRenoteId = ref<string | undefined>()
  const postFormEditNote = ref<NormalizedNote | undefined>()
  const postFormAccountId = ref<string | undefined>()

  async function resolve(note: NormalizedNote): Promise<ServerAdapter | null> {
    return getAdapter(note)
  }

  async function handleReaction(reaction: string, note: NormalizedNote) {
    const adapter = await resolve(note)
    if (!adapter) return
    try {
      await toggleReaction(adapter.api, note, reaction, () => onMutated(note))
    } catch (e) {
      console.error('[note:reaction]', AppError.from(e).message)
      toast.show('リアクションに失敗しました', 'error')
    }
  }

  async function handleRenote(note: NormalizedNote) {
    const adapter = await resolve(note)
    if (!adapter) return
    note.renoteCount = (note.renoteCount ?? 0) + 1
    onMutated(note)
    try {
      await adapter.api.createNote({ renoteId: note.id })
    } catch (e) {
      note.renoteCount = Math.max(0, (note.renoteCount ?? 1) - 1)
      onMutated(note)
      console.error('[note:renote]', AppError.from(e).message)
      toast.show('リノートに失敗しました', 'error')
    }
  }

  function handleReply(note: NormalizedNote) {
    postFormAccountId.value = note._accountId
    postFormReplyTo.value = note
    postFormRenoteId.value = undefined
    postFormEditNote.value = undefined
    showPostForm.value = true
  }

  function handleQuote(note: NormalizedNote) {
    postFormAccountId.value = note._accountId
    postFormReplyTo.value = undefined
    postFormRenoteId.value = note.id
    postFormEditNote.value = undefined
    showPostForm.value = true
  }

  async function handleDelete(note: NormalizedNote): Promise<boolean> {
    const adapter = await resolve(note)
    if (!adapter) return false
    try {
      await adapter.api.deleteNote(note.id)
      return true
    } catch (e) {
      console.error('[note:delete]', AppError.from(e).message)
      toast.show('削除に失敗しました', 'error')
      return false
    }
  }

  function handleEdit(note: NormalizedNote) {
    postFormAccountId.value = note._accountId
    postFormReplyTo.value = undefined
    postFormRenoteId.value = undefined
    postFormEditNote.value = note
    showPostForm.value = true
  }

  async function handleBookmark(note: NormalizedNote) {
    const adapter = await resolve(note)
    if (!adapter) return
    try {
      await toggleFavorite(adapter.api, note, () => onMutated(note))
    } catch (e) {
      console.error('[note:bookmark]', AppError.from(e).message)
      toast.show('ブックマークに失敗しました', 'error')
    }
  }

  function closePostForm() {
    showPostForm.value = false
    postFormReplyTo.value = undefined
    postFormRenoteId.value = undefined
    postFormEditNote.value = undefined
    postFormAccountId.value = undefined
  }

  return {
    postForm: {
      show: showPostForm,
      replyTo: postFormReplyTo,
      renoteId: postFormRenoteId,
      editNote: postFormEditNote,
      accountId: postFormAccountId,
      close: closePostForm,
    },
    handlers: {
      reaction: handleReaction,
      renote: handleRenote,
      reply: handleReply,
      quote: handleQuote,
      delete: handleDelete,
      edit: handleEdit,
      bookmark: handleBookmark,
    },
  }
}
