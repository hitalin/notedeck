import { ref } from 'vue'
import type { NormalizedNote, ServerAdapter } from '@/adapters/types'
import { isGuestAccount, useAccountsStore } from '@/stores/accounts'
import { useToast } from '@/stores/toast'
import { AppError } from '@/utils/errors'
import { hapticLight } from '@/utils/haptics'
import { showLoginPrompt } from '@/utils/loginPrompt'
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
  const accountsStore = useAccountsStore()

  /** Check if the account can perform write operations */
  function canWrite(accountId: string): boolean {
    const account = accountsStore.accountMap.get(accountId)
    if (!account) return false
    if (account.hasToken) return true
    if (!isGuestAccount(account)) showLoginPrompt()
    return false
  }

  // Post form state
  const showPostForm = ref(false)
  const postFormReplyTo = ref<NormalizedNote | undefined>()
  const postFormRenoteId = ref<string | undefined>()
  const postFormEditNote = ref<NormalizedNote | undefined>()
  const postFormAccountId = ref<string | undefined>()
  const postFormInitialText = ref<string | undefined>()
  const postFormInitialCw = ref<string | undefined>()
  const postFormInitialVisibility = ref<string | undefined>()

  async function resolve(note: NormalizedNote): Promise<ServerAdapter | null> {
    return getAdapter(note)
  }

  async function handleReaction(reaction: string, note: NormalizedNote) {
    const adapter = await resolve(note)
    if (!adapter) return
    try {
      await toggleReaction(adapter.api, note, reaction, () => onMutated(note))
    } catch (e) {
      const err = AppError.from(e)
      console.error('[note:reaction]', err.code, err.message)
      toast.show(`リアクションに失敗しました（${err.displayCode}）`, 'error')
    }
  }

  async function handleRenote(note: NormalizedNote) {
    const adapter = await resolve(note)
    if (!adapter) return
    hapticLight()
    note.renoteCount = (note.renoteCount ?? 0) + 1
    onMutated(note)
    try {
      await adapter.api.createNote({ renoteId: note.id })
    } catch (e) {
      note.renoteCount = Math.max(0, (note.renoteCount ?? 1) - 1)
      onMutated(note)
      const err = AppError.from(e)
      console.error('[note:renote]', err.code, err.message)
      toast.show(`リノートに失敗しました（${err.displayCode}）`, 'error')
    }
  }

  /** Check if the current user has renoted a note. Returns the renote ID if found. */
  async function checkMyRenote(note: NormalizedNote): Promise<string | null> {
    const adapter = await resolve(note)
    if (!adapter) return null
    try {
      const renotes = await adapter.api.getNoteRenotes(note.id, { limit: 30 })
      const account = accountsStore.accountMap.get(note._accountId)
      const mine = renotes.find(
        (r: NormalizedNote) => r.user.id === account?.userId,
      )
      return mine?.id ?? null
    } catch {
      return null
    }
  }

  /** Delete own renote with optimistic update. */
  async function handleUnrenote(
    note: NormalizedNote,
    myRenoteId: string,
  ): Promise<void> {
    const adapter = await resolve(note)
    if (!adapter) return
    note.renoteCount = Math.max(0, (note.renoteCount ?? 1) - 1)
    onMutated(note)
    try {
      await adapter.api.deleteNote(myRenoteId)
    } catch {
      note.renoteCount = (note.renoteCount ?? 0) + 1
      onMutated(note)
    }
  }

  function handleReply(note: NormalizedNote) {
    if (!canWrite(note._accountId)) return
    hapticLight()
    postFormAccountId.value = note._accountId
    postFormReplyTo.value = note
    postFormRenoteId.value = undefined
    postFormEditNote.value = undefined
    showPostForm.value = true
  }

  function handleQuote(note: NormalizedNote) {
    if (!canWrite(note._accountId)) return
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
      const err = AppError.from(e)
      console.error('[note:delete]', err.code, err.message)
      toast.show(`削除に失敗しました（${err.displayCode}）`, 'error')
      return false
    }
  }

  function handleEdit(note: NormalizedNote) {
    if (!canWrite(note._accountId)) return
    postFormAccountId.value = note._accountId
    postFormReplyTo.value = undefined
    postFormRenoteId.value = undefined
    postFormEditNote.value = note
    showPostForm.value = true
  }

  async function handleBookmark(note: NormalizedNote) {
    const adapter = await resolve(note)
    if (!adapter) return
    hapticLight()
    try {
      await toggleFavorite(adapter.api, note, () => onMutated(note))
    } catch (e) {
      const err = AppError.from(e)
      console.error('[note:bookmark]', err.code, err.message)
      toast.show(`ブックマークに失敗しました（${err.displayCode}）`, 'error')
    }
  }

  async function handleDeleteAndEdit(note: NormalizedNote) {
    const adapter = await resolve(note)
    if (!adapter) return
    try {
      await adapter.api.deleteNote(note.id)
      postFormAccountId.value = note._accountId
      postFormReplyTo.value = note.replyId
        ? await adapter.api.getNote(note.replyId).catch(() => undefined)
        : undefined
      postFormRenoteId.value = undefined
      postFormEditNote.value = undefined
      postFormInitialText.value = note.text ?? undefined
      postFormInitialCw.value = note.cw ?? undefined
      postFormInitialVisibility.value = note.visibility
      showPostForm.value = true
    } catch (e) {
      const err = AppError.from(e)
      console.error('[note:deleteAndEdit]', err.code, err.message)
      toast.show(`削除に失敗しました（${err.displayCode}）`, 'error')
    }
  }

  function closePostForm() {
    showPostForm.value = false
    postFormReplyTo.value = undefined
    postFormRenoteId.value = undefined
    postFormEditNote.value = undefined
    postFormAccountId.value = undefined
    postFormInitialText.value = undefined
    postFormInitialCw.value = undefined
    postFormInitialVisibility.value = undefined
  }

  return {
    postForm: {
      show: showPostForm,
      replyTo: postFormReplyTo,
      renoteId: postFormRenoteId,
      editNote: postFormEditNote,
      accountId: postFormAccountId,
      initialText: postFormInitialText,
      initialCw: postFormInitialCw,
      initialVisibility: postFormInitialVisibility,
      close: closePostForm,
    },
    handlers: {
      reaction: handleReaction,
      renote: handleRenote,
      checkMyRenote,
      unrenote: handleUnrenote,
      reply: handleReply,
      quote: handleQuote,
      delete: handleDelete,
      edit: handleEdit,
      bookmark: handleBookmark,
      deleteAndEdit: handleDeleteAndEdit,
    },
  }
}
