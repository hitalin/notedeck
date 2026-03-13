import { computed, onMounted, onUnmounted, ref } from 'vue'
import { initAdapterFor } from '@/adapters/initAdapter'
import type {
  ChannelSubscription,
  NormalizedNote,
  ServerAdapter,
} from '@/adapters/types'
import { useNoteSound } from '@/composables/useNoteSound'
import { useScrollDirection } from '@/composables/useScrollDirection'
import { useAccountsStore } from '@/stores/accounts'
import type { DeckColumn } from '@/stores/deck'
import { useNoteStore } from '@/stores/notes'
import { useThemeStore } from '@/stores/theme'
import { AppError } from '@/utils/errors'
import { toggleFavorite } from '@/utils/toggleFavorite'
import { toggleReaction } from '@/utils/toggleReaction'

export function useColumnSetup(getColumn: () => DeckColumn) {
  const noteStore = useNoteStore()
  let customMutatedFn: (() => void) | undefined

  function setOnNotesMutated(fn: () => void) {
    customMutatedFn = fn
  }

  /** Create a callback that replaces the note reference in the store (triggers Vue reactivity) */
  function notifyMutationFor(note: NormalizedNote) {
    return () => {
      noteStore.update(note.id, { ...note })
      customMutatedFn?.()
    }
  }
  const accountsStore = useAccountsStore()
  const themeStore = useThemeStore()

  const account = computed(() =>
    accountsStore.accounts.find((a) => a.id === getColumn().accountId),
  )

  const columnThemeVars = computed(() => {
    const accountId = getColumn().accountId
    if (!accountId) return undefined
    return themeStore.getStyleVarsForAccount(accountId)
  })

  const serverIconUrl = ref<string | undefined>()

  const isLoading = ref(false)
  const error = ref<AppError | null>(null)

  let adapter: ServerAdapter | null = null
  let subscription: ChannelSubscription | null = null

  async function initAdapter(): Promise<ServerAdapter | null> {
    const acc = account.value
    if (!acc) return null
    const result = await initAdapterFor(acc.host, acc.id)
    serverIconUrl.value = result.serverInfo.iconUrl
    adapter = result.adapter
    return adapter
  }

  function getAdapter() {
    return adapter
  }
  function setSubscription(sub: ChannelSubscription) {
    subscription = sub
  }

  function disposeSubscription() {
    subscription?.dispose()
    subscription = null
  }

  function disconnect() {
    disposeSubscription()
    adapter?.stream.cleanup()
    adapter = null
  }

  // Re-register stream event listeners on resume (handles Android background suspension)
  function handleDeckResume() {
    adapter?.stream.reconnect()
  }
  onMounted(() => window.addEventListener('deck-resume', handleDeckResume))
  onUnmounted(() => window.removeEventListener('deck-resume', handleDeckResume))

  // Post form
  const showPostForm = ref(false)
  const postFormReplyTo = ref<NormalizedNote | undefined>()
  const postFormRenoteId = ref<string | undefined>()
  const postFormEditNote = ref<NormalizedNote | undefined>()

  const actionSound = useNoteSound(() => account.value?.host, 'syuilo/bubble2')

  async function handleReaction(reaction: string, note: NormalizedNote) {
    if (!adapter) return
    try {
      await toggleReaction(adapter.api, note, reaction, notifyMutationFor(note))
      if (!getColumn().soundMuted) actionSound.play()
    } catch (e) {
      const err = AppError.from(e)
      console.error('[reaction]', err.code, err.message)
    }
  }

  async function handleRenote(note: NormalizedNote) {
    if (!adapter) return
    const notify = notifyMutationFor(note)
    note.renoteCount = (note.renoteCount ?? 0) + 1
    notify()
    try {
      await adapter.api.createNote({ renoteId: note.id })
    } catch (e) {
      note.renoteCount = Math.max(0, (note.renoteCount ?? 1) - 1)
      notify()
      const err = AppError.from(e)
      console.error('[renote]', err.code, err.message)
    }
  }

  function handleReply(note: NormalizedNote) {
    postFormReplyTo.value = note
    postFormRenoteId.value = undefined
    showPostForm.value = true
  }

  function handleQuote(note: NormalizedNote) {
    postFormReplyTo.value = undefined
    postFormRenoteId.value = note.id
    showPostForm.value = true
  }

  async function handleDelete(note: NormalizedNote): Promise<boolean> {
    if (!adapter) return false
    try {
      await adapter.api.deleteNote(note.id)
      return true
    } catch (e) {
      const err = AppError.from(e)
      console.error('[delete]', err.code, err.message)
      return false
    }
  }

  function handleEdit(note: NormalizedNote) {
    postFormReplyTo.value = undefined
    postFormRenoteId.value = undefined
    postFormEditNote.value = note
    showPostForm.value = true
  }

  async function handleBookmark(note: NormalizedNote) {
    if (!adapter) return
    try {
      await toggleFavorite(adapter.api, note, notifyMutationFor(note))
    } catch (e) {
      const err = AppError.from(e)
      console.error('[bookmark]', err.code, err.message)
    }
  }

  function closePostForm() {
    showPostForm.value = false
    postFormReplyTo.value = undefined
    postFormRenoteId.value = undefined
    postFormEditNote.value = undefined
  }

  // Scroll
  const scroller = ref<HTMLElement | null>(null)
  const { reportScroll } = useScrollDirection()

  let lastScrollCheck = 0
  function onScroll(loadMore: () => void) {
    const el = scroller.value ?? undefined
    if (!el) return

    reportScroll(el.scrollTop)

    const now = Date.now()
    if (now - lastScrollCheck < 200) return
    lastScrollCheck = now
    if (el.scrollTop + el.clientHeight >= el.scrollHeight - 300) {
      loadMore()
    }
  }

  return {
    // State
    account,
    columnThemeVars,
    serverIconUrl,
    isLoading,
    error,
    // Adapter lifecycle
    initAdapter,
    getAdapter,
    setSubscription,
    disposeSubscription,
    disconnect,
    setOnNotesMutated,
    // Post form
    postForm: {
      show: showPostForm,
      replyTo: postFormReplyTo,
      renoteId: postFormRenoteId,
      editNote: postFormEditNote,
      close: closePostForm,
    },
    // Note action handlers
    handlers: {
      reaction: handleReaction,
      renote: handleRenote,
      reply: handleReply,
      quote: handleQuote,
      delete: handleDelete,
      edit: handleEdit,
      bookmark: handleBookmark,
    },
    // Virtual scroller
    scroller,
    onScroll,
  }
}
