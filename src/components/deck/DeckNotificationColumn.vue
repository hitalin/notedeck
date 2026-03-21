<script setup lang="ts">
import { invoke } from '@tauri-apps/api/core'
import {
  computed,
  defineAsyncComponent,
  nextTick,
  onMounted,
  onUnmounted,
  ref,
  shallowRef,
  useCssModule,
  watch,
} from 'vue'
import type { NormalizedNote, NormalizedNotification } from '@/adapters/types'
import MkAvatar from '@/components/common/MkAvatar.vue'
import MkEmoji from '@/components/common/MkEmoji.vue'
import MkMfm from '@/components/common/MkMfm.vue'
import MkNote from '@/components/common/MkNote.vue'
import NoteScroller from '@/components/common/NoteScroller.vue'
import { useNoteStore } from '@/stores/notes'

const MkPostForm = defineAsyncComponent(
  () => import('@/components/common/MkPostForm.vue'),
)
const MkUserPopup = defineAsyncComponent(
  () => import('@/components/common/MkUserPopup.vue'),
)

import MkSkeleton from '@/components/common/MkSkeleton.vue'
import { useColumnSetup } from '@/composables/useColumnSetup'
import { useEmojiResolver } from '@/composables/useEmojiResolver'
import { useHoverPopup } from '@/composables/useHoverPopup'
import { useNavigation } from '@/composables/useNavigation'
import { useNoteSound } from '@/composables/useNoteSound'
import { usePullToRefresh } from '@/composables/usePullToRefresh'
import { useSwipeTab } from '@/composables/useSwipeTab'
import type { DeckColumn as DeckColumnType } from '@/stores/deck'
import { AppError } from '@/utils/errors'
import { formatTime } from '@/utils/formatTime'
import { char2twemojiUrl } from '@/utils/twemoji'
import DeckColumn from './DeckColumn.vue'

const noteStore = useNoteStore()

const props = defineProps<{
  column: DeckColumnType
}>()

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

function onNotifAvatarMouseEnter(notif: NormalizedNotification, e: MouseEvent) {
  // biome-ignore lint/style/noNonNullAssertion: user exists for interactive notifications
  hoveredUserId.value = notif.user!.id
  hoveredAccountId.value = notif._accountId
  const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
  userPopup.show({ x: rect.right + 8, y: rect.top })
}

function onNotifAvatarMouseLeave() {
  userPopup.hide()
}

function closeUserPopup() {
  userPopup.forceClose()
}

const MAX_NOTIFICATIONS = 500
const notifications = shallowRef<NormalizedNotification[]>([])
const followRequestStates = ref<Record<string, 'accepted' | 'rejected'>>({})

const NOTIFICATION_FILTERS = [
  { key: 'all', label: 'すべて', icon: 'ti ti-bell' },
  { key: 'reaction', label: 'リアクション', icon: 'ti ti-mood-plus' },
  { key: 'reply', label: 'リプライ', icon: 'ti ti-arrow-back-up' },
  { key: 'renote', label: 'リノート', icon: 'ti ti-repeat' },
  { key: 'quote', label: '引用', icon: 'ti ti-quote' },
  { key: 'mention', label: 'メンション', icon: 'ti ti-at' },
  { key: 'follow', label: 'フォロー', icon: 'ti ti-user-plus' },
  { key: 'pollEnded', label: '投票', icon: 'ti ti-chart-bar' },
  { key: 'createToken', label: 'トークン', icon: 'ti ti-key' },
] as const

type NotifFilterKey = (typeof NOTIFICATION_FILTERS)[number]['key']
const activeFilter = ref<NotifFilterKey>('all')

// Tab slide indicator
const $style = useCssModule()
const filterBarRef = ref<HTMLElement | null>(null)
const filterIndicatorStyle = ref({ left: '0px', width: '0px', opacity: '0' })

function updateFilterIndicator() {
  if (!filterBarRef.value) return
  const activeTab = filterBarRef.value.querySelector(
    `.notif-tab.${$style.filterActive}`,
  ) as HTMLElement | null
  if (!activeTab) {
    filterIndicatorStyle.value = { left: '0px', width: '0px', opacity: '0' }
    return
  }
  filterIndicatorStyle.value = {
    left: `${activeTab.offsetLeft}px`,
    width: `${activeTab.offsetWidth}px`,
    opacity: '1',
  }
}

watch(activeFilter, () => nextTick(updateFilterIndicator))
onMounted(() => nextTick(updateFilterIndicator))

const filteredNotifications = computed(() => {
  if (activeFilter.value === 'all') return notifications.value
  return notifications.value.filter((n) => n.type === activeFilter.value)
})

const noteScrollerRef = ref<{ getElement: () => HTMLElement | null } | null>(
  null,
)
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
  scroller.value?.scrollTo({ top: 0, behavior: 'smooth' })
}

function flushRafBuffer() {
  rafId = null
  if (rafBuffer.length === 0) return
  const batch = rafBuffer
  rafBuffer = []
  const updated = [...batch, ...notifications.value]
  notifications.value =
    updated.length > MAX_NOTIFICATIONS
      ? updated.slice(0, MAX_NOTIFICATIONS)
      : updated
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
  follow: 'user-plus',
  followRequestAccepted: 'user-check',
  receiveFollowRequest: 'user-question',
  pollEnded: 'chart-bar',
  createToken: 'key',
}

const NOTIFICATION_LABELS: Record<string, string> = {
  reaction: 'リアクション',
  reply: 'リプライ',
  renote: 'リノート',
  quote: '引用',
  mention: 'メンション',
  follow: 'フォロー',
  followRequestAccepted: 'フォローリクエスト承認',
  receiveFollowRequest: 'フォローリクエスト',
  pollEnded: '投票終了',
  achievementEarned: '実績獲得',
  app: '通知',
  login: 'ログイン検知',
  createToken: 'トークン作成',
  test: 'テスト通知',
}

function notificationIcon(type: string): string {
  return NOTIFICATION_ICONS[type] || 'bell'
}

function notificationLabel(type: string): string {
  return NOTIFICATION_LABELS[type] || type
}

function getCacheKey() {
  return `nd-cache-notifications-${props.column.accountId}`
}

// When account loses token (logout with keep-data), switch to cache display
watch(
  () => account.value?.hasToken,
  (hasToken, prev) => {
    if (prev && hasToken === false) {
      disconnect()
      try {
        const raw = localStorage.getItem(getCacheKey())
        if (raw) {
          const cached = JSON.parse(raw) as NormalizedNotification[]
          if (cached.length > 0) notifications.value = cached
        }
      } catch {
        /* non-critical */
      }
      isLoading.value = false
    }
  },
)

async function connect(useCache = false) {
  error.value = null
  isLoading.value = true

  if (useCache && props.column.accountId) {
    try {
      const raw = localStorage.getItem(getCacheKey())
      if (raw) {
        const cached = JSON.parse(raw) as NormalizedNotification[]
        if (cached.length > 0) notifications.value = cached
      }
    } catch {
      /* non-critical */
    }
  }

  // Logged-out: show cached notifications in read-only mode
  if (account.value && !account.value.hasToken) {
    isLoading.value = false
    return
  }

  try {
    const adapter = await initAdapter()
    if (!adapter) return

    const fetched = await adapter.api.getNotifications()
    notifications.value = fetched

    try {
      localStorage.setItem(getCacheKey(), JSON.stringify(fetched))
    } catch {
      /* storage full */
    }

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
      // Try loading from localStorage cache before showing error
      try {
        const raw = localStorage.getItem(getCacheKey())
        if (raw) {
          const cached = JSON.parse(raw) as NormalizedNotification[]
          if (cached.length > 0) {
            notifications.value = cached
          } else {
            error.value = AppError.from(e)
          }
        } else {
          error.value = AppError.from(e)
        }
      } catch {
        error.value = AppError.from(e)
      }
    }
  } finally {
    isLoading.value = false
  }
}

async function loadMore() {
  const adapter = getAdapter()
  if (!adapter || isLoading.value || notifications.value.length === 0) return
  const last = notifications.value.at(-1)
  if (!last) return
  isLoading.value = true
  try {
    const older = await adapter.api.getNotifications({ untilId: last.id })
    notifications.value = [...notifications.value, ...older]
  } catch (e) {
    error.value = AppError.from(e)
  } finally {
    isLoading.value = false
  }
}

async function removeNote(note: NormalizedNote) {
  if (await handlers.delete(note)) {
    const id = note.id
    notifications.value = notifications.value.filter(
      (x) => x.note?.id !== id && x.note?.renoteId !== id,
    )
    noteStore.remove(id)
    invoke('api_delete_cached_note', { noteId: id }).catch(() => {})
  }
}

async function handlePosted(editedNoteId?: string) {
  postForm.close()
  if (editedNoteId) {
    const adapter = getAdapter()
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
    } catch {
      // note may have been deleted
    }
  }
}

async function handleFollowRequest(
  notif: NormalizedNotification,
  action: 'accepted' | 'rejected',
) {
  const adapter = getAdapter()
  if (!adapter || !notif.user) return
  try {
    if (action === 'accepted')
      await adapter.api.acceptFollowRequest(notif.user.id)
    else await adapter.api.rejectFollowRequest(notif.user.id)
    followRequestStates.value = {
      ...followRequestStates.value,
      [notif.id]: action,
    }
  } catch (e) {
    error.value = AppError.from(e)
  }
}

function handleScroll() {
  onScroll(loadMore)
}

async function pullRefresh() {
  const adapter = getAdapter()
  if (!adapter) return
  const fetched = await adapter.api.getNotifications()
  notifications.value = fetched
  scrollToTop()
}

const { isPulling, isPulledEnough, isRefreshing, pullDistance, displayHeight } =
  usePullToRefresh(scroller, pullRefresh)

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
    @header-click="scrollToTop"
  >
    <template #header-icon>
      <i :class="$style.notifHeaderIcon" class="ti ti-bell" />
    </template>

    <template #header-meta>
      <div v-if="account" :class="$style.headerAccount">
        <img v-if="account.avatarUrl" :src="account.avatarUrl" :class="$style.headerAvatar" />
        <img :class="$style.headerFavicon" :src="serverIconUrl || `https://${account.host}/favicon.ico`" :title="account.host" />
      </div>
    </template>

    <div v-if="!account" :class="$style.columnEmpty">
      Account not found
    </div>

    <div v-else-if="error" :class="[$style.columnEmpty, $style.columnError]">
      {{ error.message }}
    </div>

    <div v-else :class="$style.notifBody">
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

      <div
        v-if="isPulling"
        :class="$style.pullFrame"
        :style="`--frame-min-height: ${displayHeight()}px`"
      >
        <div :class="$style.pullFrameContent">
          <i v-if="isRefreshing" class="ti ti-loader-2" :class="$style.spin" />
          <i v-else class="ti ti-arrow-bar-to-down" :class="{ refresh: isPulledEnough }" />
          <div :class="$style.pullText">
            <template v-if="isPulledEnough">離してリフレッシュ</template>
            <template v-else-if="isRefreshing">リフレッシュ中…</template>
            <template v-else>下に引いてリフレッシュ</template>
          </div>
        </div>
      </div>

      <div v-if="isLoading && notifications.length === 0">
        <MkSkeleton v-for="i in 5" :key="i" />
      </div>

      <NoteScroller
        v-else
        ref="noteScrollerRef"
        :items="filteredNotifications"
        :estimated-height="80"
        :class="$style.notifScroller"
        @scroll="handleScroll"
      >
        <template #default="{ item: notif, index }">
          <div :data-index="index">
            <div
              :class="[$style.notifItem, $style[`notifType_${notif.type}`]]"
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
                  <img v-else-if="account?.avatarUrl" :src="account.avatarUrl" :class="$style.notifFallbackAvatar" />
                  <i :class="[`ti ti-${notificationIcon(notif.type)}`, $style.notifSubIcon]" />
                </div>

                <!-- Tail: Header + body -->
                <div :class="$style.notifTail">
                  <div :class="$style.notifHeader">
                    <div :class="$style.notifMeta">
                      <span v-if="notif.user" :class="$style.notifUserName">
                        <MkMfm v-if="notif.user.name" :text="notif.user.name" :emojis="notif.user.emojis" :server-host="account?.host" />
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
            読み込み中...
          </div>
        </template>
      </NoteScroller>
    </div>
  </DeckColumn>

  <Teleport to="body">
    <MkUserPopup
      v-if="userPopup.isVisible.value"
      :user-id="hoveredUserId"
      :account-id="hoveredAccountId"
      :x="userPopup.position.value.x"
      :y="userPopup.position.value.y"
      @close="closeUserPopup"
    />
  </Teleport>

  <Teleport to="body">
    <MkPostForm
      v-if="postForm.show.value && column.accountId"
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
  </Teleport>
</template>

<style lang="scss" module>
@use './column-common.module.scss';

.notifHeaderIcon {
  flex-shrink: 0;
  opacity: 0.7;
}

.headerAccount {
  display: flex;
  align-items: center;
  gap: 4px;
  margin-left: 4px;
  flex-shrink: 0;
}

.headerAvatar {
  width: 18px;
  height: 18px;
  border-radius: 50%;
  object-fit: cover;
}

.headerFavicon {
  width: 16px;
  height: 16px;
  object-fit: contain;
  opacity: 0.7;
}

.notifBody {
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
  height: 3px;
  background: var(--nd-accent);
  border-radius: var(--nd-radius-full) var(--nd-radius-full) 0 0;
  transition: left var(--nd-duration-slower) cubic-bezier(0, 0, 0.2, 1), width var(--nd-duration-slower) cubic-bezier(0, 0, 0.2, 1);
  pointer-events: none;
}

.notifScroller {
  flex: 1;
  overflow-x: clip;
  scrollbar-color: var(--nd-scrollbarHandle) transparent;
  scrollbar-width: thin;
  will-change: scroll-position;
}

.notifItem {
  border-bottom: 1px solid var(--nd-divider);
}

.notifType_reaction {
  .notifSubIcon {
    color: var(--nd-love);
    background: color-mix(in srgb, var(--nd-love) 15%, var(--nd-bg));
  }
}

.notifType_reply,
.notifType_mention {
  .notifSubIcon {
    color: var(--nd-accent);
    background: color-mix(in srgb, var(--nd-accent) 15%, var(--nd-bg));
  }
}

.notifType_renote,
.notifType_quote {
  .notifSubIcon {
    color: var(--nd-renote);
    background: color-mix(in srgb, var(--nd-renote) 15%, var(--nd-bg));
  }
}

.notifType_follow,
.notifType_followRequestAccepted {
  .notifSubIcon {
    color: var(--nd-link);
    background: color-mix(in srgb, var(--nd-link) 15%, var(--nd-bg));
  }
}

.notifType_receiveFollowRequest {
  .notifSubIcon {
    color: var(--nd-warn);
    background: color-mix(in srgb, var(--nd-warn) 15%, var(--nd-bg));
  }
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

.notifUserAvatar {
  cursor: pointer;
}

.notifFallbackAvatar {
  width: 42px;
  height: 42px;
  border-radius: 50%;
  object-fit: cover;
}

.notifSubIcon {
  position: absolute;
  bottom: -2px;
  right: -4px;
  font-size: 11px;
  width: 20px;
  height: 20px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  background: var(--nd-bg);
  border: 2px solid var(--nd-bg);
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

.columnEmpty {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 2rem 1rem;
  color: var(--nd-fg);
  opacity: 0.5;
  font-size: 0.85em;
}

.columnError {
  color: var(--nd-love);
  opacity: 1;
}

.loadingMore {
  text-align: center;
  padding: 1rem;
  font-size: 0.8em;
  opacity: 0.4;
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
  transition: background var(--nd-duration-fast) ease;
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

.spin {
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}
</style>
