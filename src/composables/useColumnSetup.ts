import { computed, ref } from 'vue'
import { DynamicScroller } from 'vue-virtual-scroller'
import { createAdapter } from '@/adapters/registry'
import type { ChannelSubscription, NormalizedNote, ServerAdapter } from '@/adapters/types'
import { useAccountsStore } from '@/stores/accounts'
import { useEmojisStore } from '@/stores/emojis'
import { useServersStore } from '@/stores/servers'
import { useThemeStore } from '@/stores/theme'
import { toggleReaction } from '@/utils/toggleReaction'
import type { DeckColumn } from '@/stores/deck'

export function useColumnSetup(getColumn: () => DeckColumn) {
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
    const compiled = themeStore.getCompiledForAccount(accountId)
    if (!compiled) return undefined
    const style: Record<string, string> = {}
    for (const [key, value] of Object.entries(compiled)) {
      style[`--nd-${key}`] = value
    }
    return style
  })

  const isLoading = ref(false)
  const error = ref<string | null>(null)

  let adapter: ServerAdapter | null = null
  let subscription: ChannelSubscription | null = null

  async function initAdapter(): Promise<ServerAdapter | null> {
    const acc = account.value
    if (!acc) return null
    const serverInfo = await serversStore.getServerInfo(acc.host)
    adapter = createAdapter(serverInfo, acc.id)
    if (!emojisStore.has(acc.host)) {
      adapter.api.getServerEmojis().then((emojis) => {
        emojisStore.set(acc.host, emojis)
      }).catch(() => {})
    }
    return adapter
  }

  function getAdapter() { return adapter }
  function setSubscription(sub: ChannelSubscription) { subscription = sub }

  function disconnect() {
    subscription?.dispose()
    subscription = null
    adapter?.stream.disconnect()
    adapter = null
  }

  // Post form
  const showPostForm = ref(false)
  const postFormReplyTo = ref<NormalizedNote | undefined>()
  const postFormRenoteId = ref<string | undefined>()

  async function handleReaction(note: NormalizedNote, reaction: string) {
    if (!adapter) return
    try {
      await toggleReaction(adapter.api, note, reaction)
    } catch (e) {
      console.error('[reaction]', e)
    }
  }

  async function handleRenote(note: NormalizedNote) {
    if (!adapter) return
    try {
      await adapter.api.createNote({ renoteId: note.id })
    } catch (e) {
      console.error('[renote]', e)
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

  function closePostForm() {
    showPostForm.value = false
    postFormReplyTo.value = undefined
    postFormRenoteId.value = undefined
  }

  // Scroll
  const scroller = ref<InstanceType<typeof DynamicScroller> | null>(null)

  let lastScrollCheck = 0
  function onScroll(loadMore: () => void) {
    const now = Date.now()
    if (now - lastScrollCheck < 200) return
    lastScrollCheck = now
    const el = (scroller.value as unknown as { $el: HTMLElement })?.$el
    if (!el) return
    if (el.scrollTop + el.clientHeight >= el.scrollHeight - 300) {
      loadMore()
    }
  }

  return {
    account,
    columnThemeVars,
    isLoading,
    error,
    initAdapter,
    getAdapter,
    setSubscription,
    disconnect,
    showPostForm,
    postFormReplyTo,
    postFormRenoteId,
    handleReaction,
    handleRenote,
    handleReply,
    handleQuote,
    closePostForm,
    scroller,
    onScroll,
  }
}
