<script setup lang="ts">
import { invoke } from '@tauri-apps/api/core'
import {
  defineAsyncComponent,
  onMounted,
  onUnmounted,
  ref,
  shallowRef,
  watch,
} from 'vue'
import type { NormalizedNote, NormalizedNotification } from '@/adapters/types'
import MkAvatar from '@/components/common/MkAvatar.vue'
import MkEmoji from '@/components/common/MkEmoji.vue'
import MkMfm from '@/components/common/MkMfm.vue'
import MkNote from '@/components/common/MkNote.vue'
import NoteScroller from '@/components/common/NoteScroller.vue'
import { noteStore } from '@/stores/notes'

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
import type { DeckColumn as DeckColumnType } from '@/stores/deck'
import { AppError } from '@/utils/errors'
import { formatTime } from '@/utils/formatTime'
import { char2twemojiUrl } from '@/utils/twemoji'
import DeckColumn from './DeckColumn.vue'

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

const noteScrollerRef = ref<{ getElement: () => HTMLElement | null } | null>(null)
watch(noteScrollerRef, () => {
  scroller.value = noteScrollerRef.value?.getElement() ?? null
}, { flush: 'post' })

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
      error.value = AppError.from(e)
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

const { pullDistance, isRefreshing } = usePullToRefresh(scroller, pullRefresh)

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
      <i class="ti ti-bell notif-header-icon" />
    </template>

    <template #header-meta>
      <div v-if="account" class="header-account">
        <img v-if="account.avatarUrl" :src="account.avatarUrl" class="header-avatar" />
        <img class="header-favicon" :src="serverIconUrl || `https://${account.host}/favicon.ico`" :title="account.host" />
      </div>
    </template>

    <div v-if="!account" class="column-empty">
      Account not found
    </div>

    <div v-else-if="error" class="column-empty column-error">
      {{ error.message }}
    </div>

    <div v-else class="notif-body">
      <div
        v-if="pullDistance > 0 || isRefreshing"
        class="pull-indicator"
        :style="{ height: pullDistance + 'px' }"
      >
        <i class="ti" :class="isRefreshing ? 'ti-loader-2 spin' : 'ti-arrow-down'" :style="{ opacity: Math.min(pullDistance / 64, 1), transform: pullDistance >= 64 && !isRefreshing ? 'rotate(180deg)' : '' }" />
      </div>

      <div v-if="isLoading && notifications.length === 0">
        <MkSkeleton v-for="i in 5" :key="i" />
      </div>

      <NoteScroller
        v-else
        ref="noteScrollerRef"
        :items="notifications"
        :estimated-height="80"
        class="notif-scroller"
        @scroll="handleScroll"
      >
        <template #default="{ item: notif, index }">
          <div :data-index="index">
            <div
              class="notif-item"
              :class="`notif-type-${notif.type}`"
            >
              <!-- Notification header -->
              <div class="notif-header">
                <i :class="`ti ti-${notificationIcon(notif.type)}`" class="notif-icon" />

                <MkAvatar
                  v-if="notif.user"
                  :avatar-url="notif.user.avatarUrl"
                  :decorations="notif.user.avatarDecorations"
                  :size="36"
                  :alt="notif.user.username ?? undefined"
                  class="notif-user-avatar"
                  @click="onNotifAvatarClick(notif, $event)"
                  @mouseenter="onNotifAvatarMouseEnter(notif, $event)"
                  @mouseleave="onNotifAvatarMouseLeave"
                />

                <div class="notif-meta">
                  <span v-if="notif.user" class="notif-user-name">
                    <MkMfm v-if="notif.user.name" :text="notif.user.name" :emojis="notif.user.emojis" :server-host="account?.host" />
                    <template v-else>{{ notif.user.username }}</template>
                  </span>
                  <span class="notif-label">{{ notificationLabel(notif.type) }}</span>
                  <span v-if="notif.type === 'reaction' && notif.reaction" class="notif-reaction">
                    <img v-if="getCachedReactionUrl(notif.reaction, notif)" :src="getCachedReactionUrl(notif.reaction, notif)!" :alt="notif.reaction" class="notif-reaction-emoji" loading="lazy" />
                    <img v-else-if="getCachedTwemojiUrl(notif.reaction)" :src="getCachedTwemojiUrl(notif.reaction)!" :alt="notif.reaction" class="notif-reaction-emoji" loading="lazy" />
                    <span v-else-if="notif.reaction.startsWith(':')" class="notif-reaction-fallback">{{ notif.reaction }}</span>
                    <MkEmoji v-else :emoji="notif.reaction" class="notif-reaction-emoji" />
                  </span>
                </div>

                <span class="notif-time">{{ formatTime(notif.createdAt) }}</span>
              </div>

              <!-- Follow request actions -->
              <div
                v-if="notif.type === 'receiveFollowRequest' && notif.user"
                class="follow-request-actions"
              >
                <template v-if="followRequestStates[notif.id]">
                  <span class="follow-request-done">
                    {{ followRequestStates[notif.id] === 'accepted' ? '承認済み' : '拒否済み' }}
                  </span>
                </template>
                <template v-else>
                  <button class="follow-request-btn accept-btn" @click="handleFollowRequest(notif, 'accepted')">
                    <i class="ti ti-check" /> 承認
                  </button>
                  <button class="follow-request-btn reject-btn" @click="handleFollowRequest(notif, 'rejected')">
                    <i class="ti ti-x" /> 拒否
                  </button>
                </template>
              </div>

              <!-- Attached note (for reaction, reply, renote, quote, mention) -->
              <div v-if="notif.note" class="notif-note-wrap">
                <MkNote
                  :note="notif.note"
                  @react="handlers.reaction"
                  @reply="handlers.reply"
                  @renote="handlers.renote"
                  @quote="handlers.quote"
                  @delete="removeNote"
                  @edit="handlers.edit"
                  @bookmark="handlers.bookmark"
                />
              </div>
            </div>
          </div>
        </template>

        <template #append>
          <div v-if="isLoading && notifications.length > 0" class="loading-more">
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
      @close="postForm.close"
      @posted="handlePosted"
    />
  </Teleport>
</template>

<style scoped>
.notif-header-icon {
  flex-shrink: 0;
  opacity: 0.7;
}

.header-account {
  display: flex;
  align-items: center;
  gap: 4px;
  margin-left: 4px;
  flex-shrink: 0;
}

.header-avatar {
  width: 18px;
  height: 18px;
  border-radius: 50%;
  object-fit: cover;
}

.header-favicon {
  width: 16px;
  height: 16px;
  object-fit: contain;
  opacity: 0.7;
}

.notif-body {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.notif-scroller {
  flex: 1;
  overflow-x: clip;
  scrollbar-color: var(--nd-scrollbarHandle) transparent;
  scrollbar-width: thin;
  will-change: scroll-position;
}

.notif-item {
  border-bottom: 1px solid var(--nd-divider);
  border-left: 3px solid transparent;
}

.notif-type-reaction {
  border-left-color: var(--nd-love);
}

.notif-type-reply,
.notif-type-mention {
  border-left-color: var(--nd-accent);
}

.notif-type-renote,
.notif-type-quote {
  border-left-color: var(--nd-renote);
}

.notif-type-follow,
.notif-type-followRequestAccepted {
  border-left-color: var(--nd-link);
}

.notif-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 16px 0;
}

.notif-icon {
  flex-shrink: 0;
  opacity: 0.6;
}

.notif-type-reaction .notif-icon {
  color: var(--nd-love);
}

.notif-type-reply .notif-icon,
.notif-type-mention .notif-icon {
  color: var(--nd-accent);
}

.notif-type-renote .notif-icon,
.notif-type-quote .notif-icon {
  color: var(--nd-renote);
}

.notif-type-follow .notif-icon,
.notif-type-followRequestAccepted .notif-icon {
  color: var(--nd-link);
}

.notif-user-avatar {
  cursor: pointer;
}

.notif-meta {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}

.notif-user-name {
  font-weight: bold;
  font-size: 0.85em;
  color: var(--nd-fgHighlighted);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.notif-label {
  font-size: 0.85em;
  opacity: 0.7;
}

.notif-reaction {
  display: inline-flex;
  align-items: center;
}

.notif-reaction-emoji {
  height: 1.8em;
  vertical-align: middle;
  object-fit: contain;
}

.notif-reaction-emoji :deep(.twemoji) {
  height: 1.8em;
}

.notif-time {
  flex-shrink: 0;
  font-size: 0.8em;
  opacity: 0.5;
  margin-left: auto;
}

/* Attached note in notification — compact style */
.notif-note-wrap {
  padding: 0 8px 4px;
}

.notif-note-wrap :deep(.note-root) {
  font-size: 0.9em;
}

.notif-note-wrap :deep(.article) {
  padding: 8px 12px 12px;
}

.notif-note-wrap :deep(.avatar) {
  width: 36px;
  height: 36px;
  margin: 0 10px 0 0;
}

/* Notifications without attached note or action buttons — add bottom padding to header */
.notif-item:not(:has(.notif-note-wrap)):not(:has(.follow-request-actions)) .notif-header {
  padding-bottom: 12px;
}

.column-empty {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 2rem 1rem;
  color: var(--nd-fg);
  opacity: 0.5;
  font-size: 0.85em;
}

.column-error {
  color: var(--nd-love);
  opacity: 1;
}

.loading-more {
  text-align: center;
  padding: 1rem;
  font-size: 0.8em;
  opacity: 0.4;
}

.notif-type-receiveFollowRequest {
  border-left-color: var(--nd-warn);
}

.notif-type-receiveFollowRequest .notif-icon {
  color: var(--nd-warn);
}

.follow-request-actions {
  display: flex;
  gap: 8px;
  max-width: 300px;
  padding: 8px 16px 12px 60px;
}

.follow-request-btn {
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
  border-radius: 999px;
  cursor: pointer;
  transition: background 0.1s ease;
}

.accept-btn {
  background: var(--nd-link);
  color: #fff;
}

.accept-btn:hover {
  filter: brightness(1.1);
}

.reject-btn {
  background: transparent;
  color: var(--nd-love);
}

.reject-btn:hover {
  background: color-mix(in srgb, var(--nd-love) 10%, transparent);
}

.follow-request-done {
  font-size: 0.85em;
  opacity: 0.6;
  font-style: italic;
}

.pull-indicator {
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  flex-shrink: 0;
  color: var(--nd-accent);
  font-size: 1.2em;
  transition: height 0.2s ease;
}

.pull-indicator .ti {
  transition: transform 0.2s ease, opacity 0.2s ease;
}

.spin {
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}
</style>
