import { computed, ref } from 'vue'
import type { DynamicScroller } from 'vue-virtual-scroller'
import { createAdapter } from '@/adapters/registry'
import type {
  ChannelSubscription,
  NormalizedNote,
  ServerAdapter,
} from '@/adapters/types'
import { useAccountsStore } from '@/stores/accounts'
import type { DeckColumn } from '@/stores/deck'
import { useEmojisStore } from '@/stores/emojis'
import { noteStore } from '@/stores/notes'
import { useServersStore } from '@/stores/servers'
import { useThemeStore } from '@/stores/theme'
import { AppError } from '@/utils/errors'
import { toggleFavorite } from '@/utils/toggleFavorite'
import { toggleReaction } from '@/utils/toggleReaction'

export function useColumnSetup(getColumn: () => DeckColumn) {
  let customMutatedFn: (() => void) | undefined

  function setOnNotesMutated(fn: () => void) {
    customMutatedFn = fn
  }

  function notifyMutation() {
    noteStore.notifyMutation()
    customMutatedFn?.()
  }
  const accountsStore = useAccountsStore()
  const emojisStore = useEmojisStore()
  const serversStore = useServersStore()
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
    const serverInfo = await serversStore.getServerInfo(acc.host)
    serverIconUrl.value = serverInfo.iconUrl
    const a = createAdapter(serverInfo, acc.id)
    adapter = a
    emojisStore.ensureLoaded(acc.host, () => a.api.getServerEmojis())
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

  // Post form
  const showPostForm = ref(false)
  const postFormReplyTo = ref<NormalizedNote | undefined>()
  const postFormRenoteId = ref<string | undefined>()
  const postFormEditNote = ref<NormalizedNote | undefined>()

  async function handleReaction(reaction: string, note: NormalizedNote) {
    if (!adapter) return
    try {
      await toggleReaction(adapter.api, note, reaction, notifyMutation)
    } catch (e) {
      const err = AppError.from(e)
      console.error('[reaction]', err.code, err.message)
    }
  }

  async function handleRenote(note: NormalizedNote) {
    if (!adapter) return
    note.renoteCount = (note.renoteCount ?? 0) + 1
    notifyMutation()
    try {
      await adapter.api.createNote({ renoteId: note.id })
    } catch (e) {
      note.renoteCount = Math.max(0, (note.renoteCount ?? 1) - 1)
      notifyMutation()
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
      await toggleFavorite(adapter.api, note, notifyMutation)
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
  const scroller = ref<InstanceType<typeof DynamicScroller> | null>(null)

  let lastScrollCheck = 0
  function onScroll(loadMore: () => void) {
    const now = Date.now()
    if (now - lastScrollCheck < 200) return
    lastScrollCheck = now
    const el = scroller.value?.$el as HTMLElement | undefined
    if (!el) return
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
