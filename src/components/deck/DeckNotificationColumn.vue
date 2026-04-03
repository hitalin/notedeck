<script setup lang="ts">
import {
  computed,
  defineAsyncComponent,
  onMounted,
  onUnmounted,
  ref,
  shallowRef,
  useCssModule,
  useTemplateRef,
  watch,
} from 'vue'
import type {
  ApiAdapter,
  NormalizedNote,
  NormalizedNotification,
  NormalizedUser,
} from '@/adapters/types'
import AvatarStack from '@/components/common/AvatarStack.vue'
import LoadingSpinner from '@/components/common/LoadingSpinner.vue'
import MkAvatar from '@/components/common/MkAvatar.vue'
import MkEmoji from '@/components/common/MkEmoji.vue'
import MkMfm from '@/components/common/MkMfm.vue'
import MkNote from '@/components/common/MkNote.vue'
import NoteScroller from '@/components/common/NoteScroller.vue'
import { useColumnPullScroller } from '@/composables/useColumnPullScroller'
import { useColumnSetup } from '@/composables/useColumnSetup'
import { useEmojiResolver } from '@/composables/useEmojiResolver'
import { useHoverPopup } from '@/composables/useHoverPopup'
import { useMultiAccountAdapters } from '@/composables/useMultiAccountAdapters'
import { useNavigation } from '@/composables/useNavigation'
import { useNoteSound } from '@/composables/useNoteSound'
import { usePortal } from '@/composables/usePortal'
import { useSwipeTab } from '@/composables/useSwipeTab'
import { useTabIndicator } from '@/composables/useTabIndicator'
import { useTabSlide } from '@/composables/useTabSlide'
import { getAccountAvatarUrl, useAccountsStore } from '@/stores/accounts'
import type { DeckColumn as DeckColumnType } from '@/stores/deck'
import { useNoteStore } from '@/stores/notes'
import { usePerformanceStore } from '@/stores/performance'
import { useServersStore } from '@/stores/servers'
import { useToast } from '@/stores/toast'
import { ACHIEVEMENT_LABELS } from '@/utils/achievementLabels'
import { AppError, AUTH_ERROR_MESSAGE } from '@/utils/errors'
import { formatTime } from '@/utils/formatTime'
import { getStorageJson, STORAGE_KEYS, setStorageJson } from '@/utils/storage'
import { invoke } from '@/utils/tauriInvoke'
import { char2twemojiUrl } from '@/utils/twemoji'
import DeckColumn from './DeckColumn.vue'

const MkPostForm = defineAsyncComponent(
  () => import('@/components/common/MkPostForm.vue'),
)
const MkUserPopup = defineAsyncComponent(
  () => import('@/components/common/MkUserPopup.vue'),
)

const noteStore = useNoteStore()
const toast = useToast()

const userPopupPortalRef = useTemplateRef<HTMLElement>('userPopupPortalRef')
usePortal(userPopupPortalRef)
const postFormPortalRef = useTemplateRef<HTMLElement>('postFormPortalRef')
usePortal(postFormPortalRef)

const props = defineProps<{
  column: DeckColumnType
}>()

const isCrossAccount = computed(() => props.column.accountId == null)
const accountsStore = useAccountsStore()
const serversStore = useServersStore()
const multiAdapters = useMultiAccountAdapters()

const { reactionUrl: reactionUrlRaw } = useEmojiResolver()
const {
  account,
  columnThemeVars,
  serverIconUrl,
  isLoading,
  error,
  initAdapter,
  getAdapter,
  setSubscription,
  disconnect,
  postForm,
  handlers,
  scroller,
  onScroll,
} = useColumnSetup(() => props.column)

const isLoggedOut = computed(() => account.value?.hasToken === false)

const { navigateToUser: navToUser } = useNavigation()
const noteSound = useNoteSound(() => account.value?.host, 'syuilo/n-ea')

// User hover popup for notification avatars
const userPopup = useHoverPopup()
const hoveredUserId = ref('')
const hoveredAccountId = ref('')

function onNotifAvatarClick(notif: NormalizedNotification, e: MouseEvent) {
  e.stopPropagation()
  // biome-ignore lint/style/noNonNullAssertion: user exists for interactive notifications
  navToUser(notif._accountId, notif.user!.id)
}

function onGroupedAvatarClick(
  accountId: string,
  userId: string,
  e: MouseEvent,
) {
  e.stopPropagation()
  navToUser(accountId, userId)
}

function onNotifAvatarMouseEnter(notif: NormalizedNotification, e: MouseEvent) {
  // biome-ignore lint/style/noNonNullAssertion: user exists for interactive notifications
  hoveredUserId.value = notif.user!.id
  hoveredAccountId.value = notif._accountId
  const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
  userPopup.show({ x: rect.right + 8, y: rect.top })
}

function onGroupedAvatarMouseEnter(
  accountId: string,
  userId: string,
  e: MouseEvent,
) {
  hoveredUserId.value = userId
  hoveredAccountId.value = accountId
  const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
  userPopup.show({ x: rect.right + 8, y: rect.top })
}

function onNotifAvatarMouseLeave() {
  userPopup.hide()
}

// O(1) account lookup map for cross-account columns
const accountById = computed(() => {
  const map = new Map<string, (typeof accountsStore.accounts)[number]>()
  for (const a of accountsStore.accounts) map.set(a.id, a)
  return map
})

/** Resolve the account that owns a notification (for cross-account support) */
function resolveNotifAccount(notif: NormalizedNotification) {
  if (!isCrossAccount.value) return account.value
  return accountById.value.get(notif._accountId)
}

/** Get the server favicon URL for a notification's account */
function resolveNotifServerIcon(notif: NormalizedNotification): string | null {
  const acc = resolveNotifAccount(notif)
  if (!acc) return null
  const info = serversStore.servers.get(acc.host)
  return info?.iconUrl || `https://${acc.host}/favicon.ico`
}

function closeUserPopup() {
  userPopup.forceClose()
}

const perfStore = usePerformanceStore()
const notifications = shallowRef<NormalizedNotification[]>([])
const followRequestStates = ref<Record<string, 'accepted' | 'rejected'>>({})

// --- Notification cache helpers ---

/** Merge fresh notifications with cached ones (dedup by ID, sort by createdAt DESC) */
function mergeNotifications(
  fresh: NormalizedNotification[],
  cached: NormalizedNotification[],
  limit = perfStore.get('maxNotifications'),
): NormalizedNotification[] {
  const map = new Map<string, NormalizedNotification>()
  for (const n of cached) map.set(n.id, n)
  for (const n of fresh) map.set(n.id, n) // fresh overwrites cached
  // ISO 8601 strings are lexicographically sortable — avoid Date object allocation
  return [...map.values()]
    .sort((a, b) =>
      b.createdAt > a.createdAt ? 1 : b.createdAt < a.createdAt ? -1 : 0,
    )
    .slice(0, limit)
}

/** Debounced cache save — flushes on unmount */
let saveCacheTimer: ReturnType<typeof setTimeout> | null = null
function saveCache() {
  if (saveCacheTimer) clearTimeout(saveCacheTimer)
  saveCacheTimer = setTimeout(flushCache, 500)
}
function flushCache() {
  if (saveCacheTimer) {
    clearTimeout(saveCacheTimer)
    saveCacheTimer = null
  }
  setStorageJson(getCacheKey(), notifications.value)
}

function loadCache(): NormalizedNotification[] {
  return getStorageJson<NormalizedNotification[]>(getCacheKey(), [])
}

const NOTIFICATION_FILTERS = [
  { key: 'all', label: 'すべて', icon: 'ti ti-bell' },
  { key: 'reaction', label: 'リアクション', icon: 'ti ti-mood-plus' },
  { key: 'reply', label: 'リプライ', icon: 'ti ti-arrow-back-up' },
  { key: 'renote', label: 'リノート', icon: 'ti ti-repeat' },
  { key: 'quote', label: '引用', icon: 'ti ti-quote' },
  { key: 'mention', label: 'メンション', icon: 'ti ti-at' },
  { key: 'follow', label: 'フォロー', icon: 'ti ti-plus' },
  { key: 'pollEnded', label: 'アンケート', icon: 'ti ti-chart-arrows' },
  { key: 'achievementEarned', label: '実績', icon: 'ti ti-medal' },
  { key: 'createToken', label: 'トークン', icon: 'ti ti-key' },
] as const

type NotifFilterKey = (typeof NOTIFICATION_FILTERS)[number]['key']
const activeFilter = ref<NotifFilterKey>('all')

// Tab slide indicator
const $style = useCssModule()
const filterBarRef = ref<HTMLElement | null>(null)
const { indicatorStyle: filterIndicatorStyle } = useTabIndicator(
  filterBarRef,
  `.notif-tab.${$style.filterActive}`,
  () => activeFilter.value,
)

const filteredNotifications = computed(() => {
  if (activeFilter.value === 'all') return notifications.value
  return notifications.value.filter(
    (n) => baseType(n.type) === activeFilter.value,
  )
})

const noteScrollerRef = ref<{
  getElement: () => HTMLElement | null
  scrollToIndex: (
    index: number,
    opts?: {
      align?: 'auto' | 'start' | 'center' | 'end'
      behavior?: ScrollBehavior
    },
  ) => void
} | null>(null)
watch(
  noteScrollerRef,
  () => {
    scroller.value = noteScrollerRef.value?.getElement() ?? null
  },
  { flush: 'post' },
)

// rAF batching for streaming notifications
let rafBuffer: NormalizedNotification[] = []
let rafId: number | null = null

function scrollToTop() {
  if (noteScrollerRef.value) {
    noteScrollerRef.value.scrollToIndex(0, {
      align: 'start',
      behavior: 'smooth',
    })
  } else if (scroller.value) {
    scroller.value.scrollTo({ top: 0, behavior: 'smooth' })
  }
}

function flushRafBuffer() {
  rafId = null
  if (rafBuffer.length === 0) return
  const batch = rafBuffer
  rafBuffer = []
  const updated = [...batch, ...notifications.value]
  notifications.value =
    updated.length > perfStore.get('maxNotifications')
      ? updated.slice(0, perfStore.get('maxNotifications'))
      : updated
  saveCache()
}

// Cache reaction URLs per notification to avoid double-call in template (v-if + :src)
const reactionUrlLookup = new Map<string, string | null>()
const twemojiUrlLookup = new Map<string, string | null>()

function getCachedReactionUrl(
  reaction: string,
  notification: NormalizedNotification,
): string | null {
  const key = `${notification.id}:${reaction}`
  const cached = reactionUrlLookup.get(key)
  if (cached) return cached
  const note = notification.note
  const url = reactionUrlRaw(
    reaction,
    note?.emojis ?? {},
    note?.reactionEmojis ?? {},
    notification._serverHost,
  )
  if (url) reactionUrlLookup.set(key, url)
  return url
}

function getCachedTwemojiUrl(reaction: string): string | null {
  if (twemojiUrlLookup.has(reaction))
    return twemojiUrlLookup.get(reaction) ?? null
  const url =
    reaction.startsWith(':') && reaction.endsWith(':')
      ? null
      : char2twemojiUrl(reaction)
  twemojiUrlLookup.set(reaction, url)
  return url
}

const NOTIFICATION_ICONS: Record<string, string> = {
  reaction: 'mood-plus',
  reply: 'arrow-back-up',
  renote: 'repeat',
  quote: 'quote',
  mention: 'at',
  follow: 'plus',
  followRequestAccepted: 'check',
  receiveFollowRequest: 'clock',
  pollEnded: 'chart-arrows',
  achievementEarned: 'medal',
  login: 'login-2',
  createToken: 'key',
}

const NOTIFICATION_LABELS: Record<string, string> = {
  reaction: 'がリアクション',
  reply: 'からのリプライ',
  renote: 'がリノートしました',
  quote: 'による引用',
  mention: 'からのメンション',
  follow: 'にフォローされました',
  followRequestAccepted: 'がフォローリクエストを承認',
  receiveFollowRequest: 'からフォローリクエスト',
  pollEnded: 'アンケートの結果が出ました',
  achievementEarned: '実績を獲得',
  app: '通知',
  login: 'ログインがありました',
  createToken: 'アクセストークンが作成されました',
  test: 'テスト通知',
}

const NOTIFICATION_COLORS: Record<string, string> = {
  reaction: 'var(--nd-eventReaction)',
  reply: 'var(--nd-eventReply)',
  renote: 'var(--nd-eventRenote)',
  quote: 'var(--nd-eventRenote)',
  mention: 'var(--nd-eventOther)',
  follow: 'var(--nd-eventFollow)',
  followRequestAccepted: 'var(--nd-eventFollow)',
  receiveFollowRequest: 'var(--nd-eventFollow)',
  pollEnded: 'var(--nd-eventOther)',
  achievementEarned: 'var(--nd-eventAchievement)',
  login: 'var(--nd-eventLogin)',
  createToken: 'var(--nd-eventOther)',
}

/** Strip `:grouped` suffix for map lookups */
function baseType(type: string): string {
  return type.replace(':grouped', '')
}

function groupedUsers(notif: NormalizedNotification): NormalizedUser[] {
  let users: NormalizedUser[]
  if (notif.type === 'reaction:grouped' && notif.reactions) {
    users = notif.reactions.map((r) => r.user)
  } else if (notif.type === 'renote:grouped' && notif.users) {
    users = notif.users
  } else {
    return []
  }
  const seen = new Set<string>()
  return users.filter((u) => {
    if (seen.has(u.id)) return false
    seen.add(u.id)
    return true
  })
}

interface AvatarEntry {
  user: NormalizedUser
  reaction?: string
}

function groupedAvatarEntries(notif: NormalizedNotification): AvatarEntry[] {
  if (notif.type === 'reaction:grouped' && notif.reactions) {
    const seen = new Set<string>()
    return notif.reactions
      .filter((r) => {
        const key = `${r.user.id}\0${r.reaction}`
        if (seen.has(key)) return false
        seen.add(key)
        return true
      })
      .map((r) => ({ user: r.user, reaction: r.reaction }))
  }
  return groupedUsers(notif).map((u) => ({ user: u }))
}

function uniqueReactions(reactions: { reaction: string }[]): string[] {
  return [...new Set(reactions.map((r) => r.reaction))]
}

function notificationIcon(type: string): string {
  return NOTIFICATION_ICONS[baseType(type)] || 'bell'
}

function notificationColor(type: string): string {
  return NOTIFICATION_COLORS[baseType(type)] || 'var(--nd-eventOther)'
}

function notificationLabel(type: string): string {
  return NOTIFICATION_LABELS[baseType(type)] || type
}

function getCacheKey() {
  return STORAGE_KEYS.notificationCache(
    props.column.accountId ?? 'cross-account',
  )
}

// When account loses token (logout with keep-data), switch to cache display
watch(
  () => account.value?.hasToken,
  (hasToken, prev) => {
    if (prev && hasToken === false) {
      disconnect()
      try {
        const cached = loadCache()
        if (cached.length > 0) notifications.value = cached
      } catch {
        /* non-critical */
      }
      isLoading.value = false
    }
  },
)

function supportsGroupedNotifications(host?: string): boolean {
  if (!host) return false
  const server = serversStore.getServer(host)
  return server?.features.groupedNotifications === true
}

function fetchNotifications(
  api: Pick<ApiAdapter, 'getNotifications' | 'getNotificationsGrouped'>,
  host: string | undefined,
  opts?: { untilId?: string },
) {
  return supportsGroupedNotifications(host)
    ? api.getNotificationsGrouped(opts)
    : api.getNotifications(opts)
}

async function connectPerAccount(useCache = false) {
  error.value = null
  isLoading.value = true
  noMoreData.value = false

  const cached = loadCache()
  if (useCache && cached.length > 0) {
    notifications.value = cached
  }

  // Logged-out: show cached notifications in read-only mode
  if (account.value && !account.value.hasToken) {
    isLoading.value = false
    return
  }

  try {
    const adapter = await initAdapter()
    if (!adapter) return

    const fetched = await fetchNotifications(adapter.api, account.value?.host)
    notifications.value = mergeNotifications(fetched, cached)
    saveCache()

    adapter.stream.connect()
    noteSound.warmup()
    setSubscription(
      adapter.stream.subscribeMain((event) => {
        if (event.type === 'notification') {
          const notification = event.body as NormalizedNotification

          if (!props.column.soundMuted) noteSound.play()
          rafBuffer.push(notification)
          if (rafId === null) {
            rafId = requestAnimationFrame(flushRafBuffer)
          }
        }
      }),
    )
  } catch (e) {
    if (notifications.value.length === 0) {
      if (cached.length > 0) {
        notifications.value = cached
      } else {
        error.value = AppError.from(e)
      }
    }
  } finally {
    isLoading.value = false
  }
}

async function connectCrossAccount(useCache = false) {
  error.value = null
  isLoading.value = true
  noMoreData.value = false
  const accounts = accountsStore.accounts.filter((a) => a.hasToken)
  const cached = loadCache()

  if (useCache && cached.length > 0) {
    notifications.value = cached
  }

  try {
    const results = await Promise.allSettled(
      accounts.map(async (acc) => {
        const adapter = await multiAdapters.getOrCreate(acc.id)
        if (!adapter) return []
        return fetchNotifications(adapter.api, acc.host)
      }),
    )

    const allNotifs: NormalizedNotification[] = []
    for (const r of results) {
      if (r.status === 'fulfilled' && r.value) {
        allNotifs.push(...r.value)
      }
    }

    notifications.value = mergeNotifications(allNotifs, cached)
    saveCache()

    // Set up streaming for each account
    for (const acc of accounts) {
      const adapter = await multiAdapters.getOrCreate(acc.id)
      if (!adapter) continue
      adapter.stream.connect()
      adapter.stream.subscribeMain((event) => {
        if (event.type === 'notification') {
          const notification = event.body as NormalizedNotification
          if (!props.column.soundMuted) noteSound.play()
          rafBuffer.push(notification)
          if (rafId === null) {
            rafId = requestAnimationFrame(flushRafBuffer)
          }
        }
      })
    }
  } catch (e) {
    if (cached.length > 0) {
      notifications.value = cached
    } else {
      error.value = AppError.from(e)
    }
  } finally {
    isLoading.value = false
  }
}

async function connect(useCache = false) {
  if (isCrossAccount.value) {
    await connectCrossAccount(useCache)
  } else {
    await connectPerAccount(useCache)
  }
}

const noMoreData = ref(false)

async function loadMorePerAccount() {
  const adapter = getAdapter()
  if (!adapter || isLoading.value || noMoreData.value) return
  if (notifications.value.length === 0) return
  const last = notifications.value.at(-1)
  if (!last) return
  isLoading.value = true
  try {
    const older = await fetchNotifications(adapter.api, account.value?.host, {
      untilId: last.id,
    })
    if (older.length === 0) {
      noMoreData.value = true
      return
    }
    const merged = [...notifications.value, ...older]
    notifications.value =
      merged.length > perfStore.get('maxNotifications')
        ? merged.slice(0, perfStore.get('maxNotifications'))
        : merged
    saveCache()
  } catch (e) {
    error.value = AppError.from(e)
  } finally {
    isLoading.value = false
  }
}

async function loadMoreCrossAccount() {
  if (isLoading.value || noMoreData.value) return
  if (notifications.value.length === 0) return
  isLoading.value = true

  const accounts = accountsStore.accounts.filter((a) => a.hasToken)

  // Build last-notification-per-account map in a single reverse pass (O(n))
  const lastByAccount = new Map<string, NormalizedNotification>()
  for (let i = notifications.value.length - 1; i >= 0; i--) {
    const n = notifications.value[i]
    if (n && !lastByAccount.has(n._accountId))
      lastByAccount.set(n._accountId, n)
  }

  try {
    const results = await Promise.allSettled(
      accounts.map(async (acc) => {
        const adapter = await multiAdapters.getOrCreate(acc.id)
        if (!adapter) return []
        const lastForAccount = lastByAccount.get(acc.id)
        if (!lastForAccount) return fetchNotifications(adapter.api, acc.host)
        return fetchNotifications(adapter.api, acc.host, {
          untilId: lastForAccount.id,
        })
      }),
    )

    const olderNotifs: NormalizedNotification[] = []
    for (const r of results) {
      if (r.status === 'fulfilled' && r.value) {
        olderNotifs.push(...r.value)
      }
    }

    if (olderNotifs.length === 0) {
      noMoreData.value = true
      return
    }

    notifications.value = mergeNotifications(olderNotifs, notifications.value)
    saveCache()
  } catch (e) {
    error.value = AppError.from(e)
  } finally {
    isLoading.value = false
  }
}

async function loadMore() {
  if (isCrossAccount.value) {
    await loadMoreCrossAccount()
  } else {
    await loadMorePerAccount()
  }
}

async function removeNote(note: NormalizedNote) {
  if (isCrossAccount.value) {
    const adapter = await multiAdapters.getOrCreate(note._accountId)
    if (!adapter) return
    try {
      await adapter.api.deleteNote(note.id)
    } catch {
      return
    }
  } else {
    if (!(await handlers.delete(note))) return
  }
  const id = note.id
  notifications.value = notifications.value.filter(
    (x) => x.note?.id !== id && x.note?.renoteId !== id,
  )
  saveCache()
  noteStore.remove(id)
  invoke('api_delete_cached_note', { noteId: id }).catch((e) => {
    if (import.meta.env.DEV) console.debug('[delete-cached-note] ignored:', e)
  })
}

async function handlePosted(editedNoteId?: string) {
  postForm.close()
  if (editedNoteId) {
    let adapter: Awaited<ReturnType<typeof multiAdapters.getOrCreate>> = null
    if (isCrossAccount.value) {
      // Find the account that owns this note
      const notif = notifications.value.find((n) => n.note?.id === editedNoteId)
      if (notif) adapter = await multiAdapters.getOrCreate(notif._accountId)
    } else {
      adapter = getAdapter()
    }
    if (!adapter) return
    try {
      const updated = await adapter.api.getNote(editedNoteId)
      notifications.value = notifications.value.map((x) => {
        if (!x.note) return x
        if (x.note.id === editedNoteId) return { ...x, note: updated }
        if (x.note.renoteId === editedNoteId)
          return { ...x, note: { ...x.note, renote: updated } }
        return x
      })
      saveCache()
    } catch {
      // note may have been deleted
    }
  }
}

async function handleFollowRequest(
  notif: NormalizedNotification,
  action: 'accepted' | 'rejected',
) {
  if (!notif.user) return
  let adapter: Awaited<ReturnType<typeof multiAdapters.getOrCreate>> = null
  if (isCrossAccount.value) {
    adapter = await multiAdapters.getOrCreate(notif._accountId)
  } else {
    adapter = getAdapter()
  }
  if (!adapter) return
  try {
    if (action === 'accepted')
      await adapter.api.acceptFollowRequest(notif.user.id)
    else await adapter.api.rejectFollowRequest(notif.user.id)
    followRequestStates.value = {
      ...followRequestStates.value,
      [notif.id]: action,
    }
  } catch (e) {
    const appErr = AppError.from(e)
    if (appErr.message.includes('NO_SUCH_FOLLOW_REQUEST')) {
      followRequestStates.value = {
        ...followRequestStates.value,
        [notif.id]: action,
      }
    } else {
      toast.show(appErr.message, 'error')
    }
  }
}

function handleScroll() {
  onScroll(loadMore)
}

async function pullRefresh() {
  if (isCrossAccount.value) {
    await connectCrossAccount()
    scrollToTop()
  } else {
    const adapter = getAdapter()
    if (!adapter) return
    const fetched = await adapter.api.getNotifications()
    notifications.value = mergeNotifications(fetched, notifications.value)
    saveCache()
    scrollToTop()
  }
}

useColumnPullScroller(scroller)

// Tab slide animation
const notifTabIndex = computed(() =>
  NOTIFICATION_FILTERS.findIndex((f) => f.key === activeFilter.value),
)
useTabSlide(notifTabIndex, scroller)

// Swipe / wheel to switch notification filter tabs
useSwipeTab(
  scroller,
  () => {
    // swipe left → next filter
    const idx = NOTIFICATION_FILTERS.findIndex(
      (f) => f.key === activeFilter.value,
    )
    const next =
      idx >= 0 && idx < NOTIFICATION_FILTERS.length - 1
        ? NOTIFICATION_FILTERS[idx + 1]
        : undefined
    if (next) {
      activeFilter.value = next.key
      return true
    }
    return false
  },
  () => {
    // swipe right → previous filter
    const idx = NOTIFICATION_FILTERS.findIndex(
      (f) => f.key === activeFilter.value,
    )
    const prev = idx > 0 ? NOTIFICATION_FILTERS[idx - 1] : undefined
    if (prev) {
      activeFilter.value = prev.key
      return true
    }
    return false
  },
)

onMounted(() => {
  connect(true)
})

onUnmounted(() => {
  flushCache()
  disconnect()
  if (rafId !== null) {
    cancelAnimationFrame(rafId)
    rafId = null
  }
  reactionUrlLookup.clear()
  twemojiUrlLookup.clear()
})
</script>

<template>
  <DeckColumn
    :column-id="column.id"
    title="通知"
    :theme-vars="columnThemeVars"
    sound-enabled
    :pull-refresh="pullRefresh"
    @header-click="scrollToTop"
  >
    <template #header-icon>
      <i :class="$style.tlHeaderIcon" class="ti ti-bell" />
    </template>

    <template #header-meta>
      <div v-if="isCrossAccount" :class="$style.headerAccount">
        <AvatarStack :size="20" />
      </div>
      <div v-else-if="account" :class="$style.headerAccount">
        <img :src="getAccountAvatarUrl(account)" :class="$style.headerAvatar" />
        <img :class="$style.headerFavicon" :src="serverIconUrl || `https://${account.host}/favicon.ico`" :title="account.host" />
      </div>
    </template>

    <template #header-extra>
      <!-- Notification filter tabs -->
      <div ref="filterBarRef" :class="$style.filterBar">
        <button
          v-for="filter in NOTIFICATION_FILTERS"
          :key="filter.key"
          class="_button notif-tab"
          :class="[$style.filterBtn, { [$style.filterActive]: activeFilter === filter.key }]"
          :title="filter.label"
          @click="activeFilter = filter.key"
        >
          <i :class="filter.icon" />
          <span v-if="activeFilter === filter.key" :class="$style.filterLabel">{{ filter.label }}</span>
        </button>
        <div :class="$style.filterIndicator" :style="filterIndicatorStyle" />
      </div>
    </template>

    <div v-if="!isCrossAccount && !account" :class="$style.columnEmpty">
      アカウントが見つかりません
    </div>

    <div v-else-if="error && !isLoggedOut" :class="[$style.columnEmpty, $style.columnError]">
      {{ error.isAuth ? AUTH_ERROR_MESSAGE : error.message }}
    </div>

    <div v-else :class="$style.notifBody">
      <div v-if="isLoading && notifications.length === 0" :class="$style.columnLoading">
        <LoadingSpinner />
      </div>

      <NoteScroller
        v-if="!(isLoading && notifications.length === 0)"
        ref="noteScrollerRef"
        :items="filteredNotifications"
        :estimated-height="80"
        :class="$style.notifScroller"
        @scroll="handleScroll"
      >
        <template #default="{ item: notif, index }">
          <div>
            <!-- Grouped notification: reaction:grouped / renote:grouped -->
            <div
              v-if="notif.type === 'reaction:grouped' || notif.type === 'renote:grouped'"
              :class="$style.notifItem"
            >
              <div :class="$style.notifLayout">
                <div :class="$style.notifGroupedHead">
                  <div
                    v-for="entry in groupedAvatarEntries(notif).slice(0, 3)"
                    :key="`${entry.user.id}-${entry.reaction ?? ''}`"
                    :class="$style.notifHead"
                  >
                    <MkAvatar
                      :avatar-url="entry.user.avatarUrl"
                      :decorations="entry.user.avatarDecorations"
                      :size="42"
                      :alt="entry.user.username ?? undefined"
                      :class="$style.notifUserAvatar"
                      @click="onGroupedAvatarClick(notif._accountId, entry.user.id, $event)"
                      @mouseenter="onGroupedAvatarMouseEnter(notif._accountId, entry.user.id, $event)"
                      @mouseleave="onNotifAvatarMouseLeave"
                    />
                    <template v-if="entry.reaction">
                      <img v-if="getCachedReactionUrl(entry.reaction, notif)" :src="getCachedReactionUrl(entry.reaction, notif)!" :alt="entry.reaction" :class="$style.notifSubIconEmoji" loading="lazy" />
                      <img v-else-if="getCachedTwemojiUrl(entry.reaction)" :src="getCachedTwemojiUrl(entry.reaction)!" :alt="entry.reaction" :class="$style.notifSubIconEmoji" loading="lazy" />
                      <i v-else :class="[`ti ti-${notificationIcon(notif.type)}`, $style.notifSubIcon]" :style="{ background: notificationColor(notif.type) }" />
                    </template>
                    <i v-else :class="[`ti ti-${notificationIcon(notif.type)}`, $style.notifSubIcon]" :style="{ background: notificationColor(notif.type) }" />
                  </div>
                </div>
                <div :class="$style.notifTail">
                  <div :class="$style.notifHeader">
                    <div :class="$style.notifMeta">
                      <span :class="$style.notifUserName">
                        <template v-for="(u, i) in groupedUsers(notif).slice(0, 2)" :key="u.id">
                          <template v-if="i > 0">, </template>
                          <MkMfm v-if="u.name" :text="u.name" :emojis="u.emojis" :server-host="notif._serverHost" />
                          <template v-else>{{ u.username }}</template>
                        </template>
                        <template v-if="groupedUsers(notif).length > 2"> 他{{ groupedUsers(notif).length - 2 }}人</template>
                      </span>
                      <span :class="$style.notifLabel">{{ notificationLabel(notif.type) }}</span>
                      <template v-if="notif.type === 'reaction:grouped' && notif.reactions?.length">
                        <span v-for="reaction in uniqueReactions(notif.reactions)" :key="reaction" :class="$style.notifReaction">
                          <img v-if="getCachedReactionUrl(reaction, notif)" :src="getCachedReactionUrl(reaction, notif)!" :alt="reaction" :class="$style.notifReactionEmoji" loading="lazy" />
                          <img v-else-if="getCachedTwemojiUrl(reaction)" :src="getCachedTwemojiUrl(reaction)!" :alt="reaction" :class="$style.notifReactionEmoji" loading="lazy" />
                          <MkEmoji v-else :emoji="reaction" :class="$style.notifReactionEmoji" />
                        </span>
                      </template>
                    </div>
                    <span :class="$style.notifTime">{{ formatTime(notif.createdAt) }}</span>
                  </div>

                  <div v-if="notif.note" :class="$style.notifNoteWrap">
                    <MkNote
                      :note="notif.note"
                      embedded
                      @react="handlers.reaction"
                      @reply="handlers.reply"
                      @renote="handlers.renote"
                      @quote="handlers.quote"
                      @delete="removeNote"
                      @edit="handlers.edit"
                      @bookmark="handlers.bookmark"
                      @delete-and-edit="handlers.deleteAndEdit"
                    />
                  </div>
                </div>
              </div>
            </div>

            <!-- Normal notification -->
            <div
              v-else
              :class="$style.notifItem"
            >
              <div :class="$style.notifLayout">
                <!-- Head: Avatar with sub-icon overlay -->
                <div :class="$style.notifHead">
                  <MkAvatar
                    v-if="notif.user"
                    :avatar-url="notif.user.avatarUrl"
                    :decorations="notif.user.avatarDecorations"
                    :size="42"
                    :alt="notif.user.username ?? undefined"
                    :class="$style.notifUserAvatar"
                    @click="onNotifAvatarClick(notif, $event)"
                    @mouseenter="onNotifAvatarMouseEnter(notif, $event)"
                    @mouseleave="onNotifAvatarMouseLeave"
                  />
                  <template v-else>
                    <img v-if="resolveNotifAccount(notif)?.avatarUrl" :src="resolveNotifAccount(notif)!.avatarUrl!" :class="$style.notifFallbackAvatar" />
                    <img
                      v-if="isCrossAccount && resolveNotifServerIcon(notif)"
                      :src="resolveNotifServerIcon(notif)!"
                      :class="$style.notifServerBadge"
                      :title="resolveNotifAccount(notif)?.host"
                    />
                  </template>
                  <template v-if="notif.type === 'reaction' && notif.reaction">
                    <img v-if="getCachedReactionUrl(notif.reaction, notif)" :src="getCachedReactionUrl(notif.reaction, notif)!" :alt="notif.reaction" :class="$style.notifSubIconEmoji" loading="lazy" />
                    <img v-else-if="getCachedTwemojiUrl(notif.reaction)" :src="getCachedTwemojiUrl(notif.reaction)!" :alt="notif.reaction" :class="$style.notifSubIconEmoji" loading="lazy" />
                    <i v-else :class="[`ti ti-${notificationIcon(notif.type)}`, $style.notifSubIcon]" :style="{ background: notificationColor(notif.type) }" />
                  </template>
                  <i v-else :class="[`ti ti-${notificationIcon(notif.type)}`, $style.notifSubIcon]" :style="{ background: notificationColor(notif.type) }" />
                </div>

                <!-- Tail: Header + body -->
                <div :class="$style.notifTail">
                  <div :class="$style.notifHeader">
                    <div :class="$style.notifMeta">
                      <span v-if="notif.user" :class="$style.notifUserName">
                        <MkMfm v-if="notif.user.name" :text="notif.user.name" :emojis="notif.user.emojis" :server-host="notif._serverHost" />
                        <template v-else>{{ notif.user.username }}</template>
                      </span>
                      <span :class="$style.notifLabel">{{ notificationLabel(notif.type) }}</span>
                      <span v-if="notif.type === 'reaction' && notif.reaction" :class="$style.notifReaction">
                        <img v-if="getCachedReactionUrl(notif.reaction, notif)" :src="getCachedReactionUrl(notif.reaction, notif)!" :alt="notif.reaction" :class="$style.notifReactionEmoji" loading="lazy" />
                        <img v-else-if="getCachedTwemojiUrl(notif.reaction)" :src="getCachedTwemojiUrl(notif.reaction)!" :alt="notif.reaction" :class="$style.notifReactionEmoji" loading="lazy" />
                        <span v-else-if="notif.reaction.startsWith(':')" :class="$style.notifReactionFallback">{{ notif.reaction }}</span>
                        <MkEmoji v-else :emoji="notif.reaction" :class="$style.notifReactionEmoji" />
                      </span>
                    </div>
                    <span :class="$style.notifTime">{{ formatTime(notif.createdAt) }}</span>
                  </div>

                  <!-- Achievement name -->
                  <div v-if="notif.type === 'achievementEarned' && notif.achievement" :class="$style.notifAchievement">
                    {{ ACHIEVEMENT_LABELS[notif.achievement] ?? notif.achievement }}
                  </div>

                  <!-- Follow request actions -->
                  <div
                    v-if="notif.type === 'receiveFollowRequest' && notif.user"
                    :class="$style.followRequestActions"
                  >
                    <template v-if="followRequestStates[notif.id]">
                      <span :class="$style.followRequestDone">
                        {{ followRequestStates[notif.id] === 'accepted' ? '承認済み' : '拒否済み' }}
                      </span>
                    </template>
                    <template v-else>
                      <button :class="[$style.followRequestBtn, $style.acceptBtn]" @click="handleFollowRequest(notif, 'accepted')">
                        <i class="ti ti-check" /> 承認
                      </button>
                      <button :class="[$style.followRequestBtn, $style.rejectBtn]" @click="handleFollowRequest(notif, 'rejected')">
                        <i class="ti ti-x" /> 拒否
                      </button>
                    </template>
                  </div>

                  <!-- followRequestAccepted message -->
                  <div v-if="notif.type === 'followRequestAccepted' && notif.message" :class="$style.notifMessage">
                    {{ notif.message }}
                  </div>

                  <!-- createToken warning -->
                  <div v-if="notif.type === 'createToken'" :class="$style.notifMessage">
                    心当たりがない場合は<a :href="`https://${notif._serverHost}/settings/connect`" target="_blank" rel="noopener noreferrer" :class="$style.notifMessageLink">アクセストークンの管理</a>を通じてアクセストークンを削除してください。
                  </div>

                  <!-- Attached note (for reaction, reply, renote, quote, mention) -->
                  <div v-if="notif.note" :class="$style.notifNoteWrap">
                    <MkNote
                      :note="notif.note"
                      embedded
                      @react="handlers.reaction"
                      @reply="handlers.reply"
                      @renote="handlers.renote"
                      @quote="handlers.quote"
                      @delete="removeNote"
                      @edit="handlers.edit"
                      @bookmark="handlers.bookmark"
                      @delete-and-edit="handlers.deleteAndEdit"
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </template>

        <template #append>
          <div v-if="isLoading && notifications.length > 0" :class="$style.loadingMore">
            <LoadingSpinner />
          </div>
        </template>
      </NoteScroller>
    </div>
  </DeckColumn>

  <div v-if="userPopup.isVisible.value" ref="userPopupPortalRef">
    <MkUserPopup
      :user-id="hoveredUserId"
      :account-id="hoveredAccountId"
      :x="userPopup.position.value.x"
      :y="userPopup.position.value.y"
      @close="closeUserPopup"
    />
  </div>

  <div v-if="postForm.show.value && column.accountId" ref="postFormPortalRef">
    <MkPostForm
      :account-id="column.accountId"
      :reply-to="postForm.replyTo.value"
      :renote-id="postForm.renoteId.value"
      :edit-note="postForm.editNote.value"
      :initial-text="postForm.initialText.value"
      :initial-cw="postForm.initialCw.value"
      :initial-visibility="postForm.initialVisibility.value"
      @close="postForm.close"
      @posted="handlePosted"
    />
  </div>
</template>

<style lang="scss" module>
@use './column-common.module.scss';



.notifBody {
  position: relative;
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.filterBar {
  display: flex;
  position: relative;
  border-bottom: 1px solid var(--nd-divider);
  background: var(--nd-bg);
  flex-shrink: 0;
  overflow-x: auto;
  scrollbar-width: none;

  &::-webkit-scrollbar {
    display: none;
  }
}

.filterBtn {
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  gap: 4px;
  padding: 8px 12px;
  font-size: 0.85em;
  color: var(--nd-fg);
  opacity: 0.4;
  transition: opacity var(--nd-duration-base), background var(--nd-duration-base);
  position: relative;

  &:hover {
    opacity: 0.7;
    background: var(--nd-buttonHoverBg);
  }
}

.filterActive {
  opacity: 1;
}

.filterLabel {
  font-size: 0.85em;
  font-weight: bold;
  white-space: nowrap;
}

.filterIndicator {
  position: absolute;
  bottom: 0;
  left: 0;
  width: 1px;
  height: 3px;
  background: var(--nd-accent);
  border-radius: var(--nd-radius-full) var(--nd-radius-full) 0 0;
  transform-origin: 0 0;
  transition: translate var(--nd-duration-slower) var(--nd-ease-pop), scale var(--nd-duration-slower) var(--nd-ease-pop), opacity var(--nd-duration-slower) var(--nd-ease-pop);
  pointer-events: none;
}

.notifScroller {
  flex: 1;
  overflow-x: clip;
  scrollbar-color: var(--nd-scrollbarHandle) transparent;
  scrollbar-width: thin;
}

.notifItem {
  border-bottom: 1px solid var(--nd-divider);
  contain: layout style paint;
  content-visibility: auto;
  contain-intrinsic-size: auto 80px;
}

.notifLayout {
  display: flex;
  padding: 12px 16px;
  gap: 12px;
}

.notifHead {
  position: relative;
  flex-shrink: 0;
  width: 42px;
  height: 42px;
}

.notifGroupedHead {
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
  gap: 5px;
}

.notifUserAvatar {
  cursor: pointer;
}

.notifFallbackAvatar {
  width: 42px;
  height: 42px;
  border-radius: 50%;
  object-fit: cover;
}

.notifServerBadge {
  position: absolute;
  top: -2px;
  right: -4px;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  object-fit: contain;
  background: var(--nd-panel);
  box-shadow: 0 0 0 3px var(--nd-panel);
}

.notifSubIcon {
  position: absolute;
  bottom: -2px;
  right: -2px;
  font-size: 11px;
  width: 20px;
  height: 20px;
  line-height: 20px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  background: var(--nd-panel);
  box-shadow: 0 0 0 3px var(--nd-panel);
  color: #fff;
  text-align: center;
}

.notifSubIconEmoji {
  position: absolute;
  bottom: -2px;
  right: -2px;
  width: 20px;
  height: 20px;
  border-radius: 50%;
  object-fit: contain;
  background: var(--nd-panel);
  box-shadow: 0 0 0 3px var(--nd-panel);
}

.notifTail {
  flex: 1;
  min-width: 0;
}

.notifHeader {
  display: flex;
  align-items: center;
  gap: 8px;
}

.notifMeta {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}

.notifUserName {
  font-weight: bold;
  font-size: 0.85em;
  color: var(--nd-fgHighlighted);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.notifLabel {
  font-size: 0.85em;
  opacity: 0.7;
}

.notifAchievement {
  font-size: 0.85em;
  color: var(--nd-fg);
  opacity: 0.7;
  margin-top: 2px;
}

.notifReaction {
  display: inline-flex;
  align-items: center;
}

.notifReactionEmoji {
  height: 1.8em;
  vertical-align: middle;
  object-fit: contain;

  :deep(.twemoji) {
    height: 1.8em;
  }
}

.notifReactionFallback {
  /* fallback text for custom emoji codes */
}

.notifTime {
  flex-shrink: 0;
  font-size: 0.8em;
  opacity: 0.5;
  margin-left: auto;
}

.notifMessage {
  margin-top: 4px;
  font-size: 0.85em;
  opacity: 0.7;
  line-height: 1.5;
}

.notifMessageLink {
  color: var(--nd-link);
  text-decoration: none;

  &:hover {
    text-decoration: underline;
  }
}

/* Attached note in notification — compact style */
.notifNoteWrap {
  margin-top: 4px;

  :deep(.note-root) {
    font-size: 0.9em;
  }

  :deep(.article) {
    padding: 8px 12px 12px;
  }

  :deep(.avatar) {
    display: none;
  }
}

.followRequestActions {
  display: flex;
  gap: 8px;
  max-width: 300px;
  padding: 8px 0 0;
}

.followRequestBtn {
  flex: 1;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  min-width: 100px;
  padding: 7px 14px;
  font-weight: bold;
  font-size: 0.85em;
  border: none;
  border-radius: var(--nd-radius-full);
  cursor: pointer;
  transition: background var(--nd-duration-fast) ease, filter var(--nd-duration-base);
}

.acceptBtn {
  background: var(--nd-link);
  color: #fff;

  &:hover {
    filter: brightness(1.1);
  }
}

.rejectBtn {
  background: transparent;
  color: var(--nd-love);

  &:hover {
    background: var(--nd-love-subtle);
  }
}

.followRequestDone {
  font-size: 0.85em;
  opacity: 0.6;
  font-style: italic;
}


</style>
