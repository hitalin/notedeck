<script setup lang="ts">
import { onMounted, onUnmounted, shallowRef } from 'vue'
import { DynamicScroller, DynamicScrollerItem } from 'vue-virtual-scroller'
import type { NormalizedNote, NormalizedNotification } from '@/adapters/types'
import MkEmoji from '@/components/common/MkEmoji.vue'
import MkNote from '@/components/common/MkNote.vue'
import MkPostForm from '@/components/common/MkPostForm.vue'
import { useColumnSetup } from '@/composables/useColumnSetup'
import { useEmojiResolver } from '@/composables/useEmojiResolver'
import type { DeckColumn as DeckColumnType } from '@/stores/deck'
import { sendDesktopNotification } from '@/utils/desktopNotification'
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

const MAX_NOTIFICATIONS = 500
const notifications = shallowRef<NormalizedNotification[]>([])

// rAF batching for streaming notifications
let rafBuffer: NormalizedNotification[] = []
let rafId: number | null = null

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
  if (reactionUrlLookup.has(key)) return reactionUrlLookup.get(key)!
  const note = notification.note
  const url = reactionUrlRaw(
    reaction,
    note?.emojis ?? {},
    note?.reactionEmojis ?? {},
    notification._serverHost,
  )
  reactionUrlLookup.set(key, url)
  return url
}

function getCachedTwemojiUrl(reaction: string): string | null {
  if (twemojiUrlLookup.has(reaction)) return twemojiUrlLookup.get(reaction)!
  const url =
    reaction.startsWith(':') && reaction.endsWith(':')
      ? null
      : char2twemojiUrl(reaction)
  twemojiUrlLookup.set(reaction, url)
  return url
}

const NOTIFICATION_ICONS: Record<string, string> = {
  reaction: 'M12 4v16M4 12h16',
  reply: 'M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z',
  renote:
    'M17 1l4 4-4 4M3 11V9a4 4 0 0 1 4-4h14M7 23l-4-4 4-4M21 13v2a4 4 0 0 1-4 4H3',
  quote: 'M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z',
  mention: 'M12 21a9 9 0 100-18 9 9 0 000 18zM12 8v4M12 16h.01',
  follow:
    'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM19 8v6M22 11h-6',
  followRequestAccepted:
    'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM20 6l-4 4 2 2',
  pollEnded:
    'M9 11l3 3L22 4M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11',
}

const NOTIFICATION_LABELS: Record<string, string> = {
  reaction: 'reacted',
  reply: 'replied',
  renote: 'renoted',
  quote: 'quoted',
  mention: 'mentioned you',
  follow: 'followed you',
  followRequestAccepted: 'accepted your follow request',
  receiveFollowRequest: 'requested to follow you',
  pollEnded: 'Poll ended',
  achievementEarned: 'Achievement earned',
  app: 'Notification',
  login: 'Login detected',
  test: 'Test notification',
}

function notificationIcon(type: string): string {
  return (
    NOTIFICATION_ICONS[type] ||
    'M12 21a9 9 0 100-18 9 9 0 000 18zM12 8v4M12 16h.01'
  )
}

function notificationLabel(type: string): string {
  return NOTIFICATION_LABELS[type] || type
}

async function connect() {
  error.value = null
  isLoading.value = true
  try {
    const adapter = await initAdapter()
    if (!adapter) return

    const fetched = await adapter.api.getNotifications()
    notifications.value = fetched

    adapter.stream.connect()
    setSubscription(
      adapter.stream.subscribeMain((event) => {
        if (event.type === 'notification') {
          const notification = event.body as NormalizedNotification

          if (
            ['reply', 'mention', 'quote', 'follow'].includes(notification.type)
          ) {
            const userName =
              notification.user?.name ||
              notification.user?.username ||
              'Someone'
            const label =
              NOTIFICATION_LABELS[notification.type] || notification.type
            sendDesktopNotification(`NoteDeck — ${userName}`, label)
          }

          rafBuffer.push(notification)
          if (rafId === null) {
            rafId = requestAnimationFrame(flushRafBuffer)
          }
        }
      }),
    )
  } catch (e) {
    error.value = AppError.from(e)
  } finally {
    isLoading.value = false
  }
}

async function loadMore() {
  const adapter = getAdapter()
  if (!adapter || isLoading.value || notifications.value.length === 0) return
  const last = notifications.value[notifications.value.length - 1]!
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

function handleScroll() {
  onScroll(loadMore)
}

onMounted(() => {
  connect()
})

onUnmounted(() => {
  disconnect()
  if (rafId !== null) {
    cancelAnimationFrame(rafId)
    rafId = null
  }
})
</script>

<template>
  <DeckColumn
    :column-id="column.id"
    title="Notifications"
    :theme-vars="columnThemeVars"
  >
    <template #header-icon>
      <svg class="notif-header-icon" viewBox="0 0 24 24" width="14" height="14">
        <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9M13.73 21a2 2 0 0 1-3.46 0" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" fill="none" />
      </svg>
    </template>

    <template #header-meta>
      <div v-if="account" class="header-account">
        <img v-if="account.avatarUrl" :src="account.avatarUrl" class="header-avatar" />
        <span class="header-host">{{ account.host }}</span>
      </div>
    </template>

    <div v-if="!account" class="column-empty">
      Account not found
    </div>

    <div v-else-if="error" class="column-empty column-error">
      {{ error.message }}
    </div>

    <div v-else class="notif-body">
      <div v-if="isLoading && notifications.length === 0" class="column-empty">
        Loading...
      </div>

      <DynamicScroller
        v-else
        ref="scroller"
        class="notif-scroller"
        :items="notifications"
        :min-item-size="60"
        :buffer="400"
        key-field="id"
        @scroll.passive="handleScroll"
      >
        <template #default="{ item: notif, active, index }">
          <DynamicScrollerItem
            :item="notif"
            :active="active"
            :data-index="index"
          >
            <div
              class="notif-item"
              :class="`notif-type-${notif.type}`"
            >
              <!-- Notification header -->
              <div class="notif-header">
                <svg class="notif-icon" viewBox="0 0 24 24" width="16" height="16">
                  <path
                    :d="notificationIcon(notif.type)"
                    stroke="currentColor"
                    stroke-width="2"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    fill="none"
                  />
                </svg>

                <template v-if="notif.user">
                  <img
                    v-if="notif.user.avatarUrl"
                    :src="notif.user.avatarUrl"
                    class="notif-user-avatar"
                  />
                  <div v-else class="notif-user-avatar notif-avatar-placeholder" />
                </template>

                <div class="notif-meta">
                  <span v-if="notif.user" class="notif-user-name">
                    {{ notif.user.name || notif.user.username }}
                  </span>
                  <span class="notif-label">{{ notificationLabel(notif.type) }}</span>
                  <span v-if="notif.type === 'reaction' && notif.reaction" class="notif-reaction">
                    <img v-if="getCachedReactionUrl(notif.reaction, notif)" :src="getCachedReactionUrl(notif.reaction, notif)!" :alt="notif.reaction" class="notif-reaction-emoji" />
                    <img v-else-if="getCachedTwemojiUrl(notif.reaction)" :src="getCachedTwemojiUrl(notif.reaction)!" :alt="notif.reaction" class="notif-reaction-emoji" />
                    <MkEmoji v-else :emoji="notif.reaction" class="notif-reaction-emoji" />
                  </span>
                </div>

                <span class="notif-time">{{ formatTime(notif.createdAt) }}</span>
              </div>

              <!-- Attached note (for reaction, reply, renote, quote, mention) -->
              <div v-if="notif.note" class="notif-note-wrap">
                <MkNote
                  :note="notif.note"
                  @react="(reaction: string) => handlers.reaction(notif.note!, reaction)"
                  @reply="handlers.reply"
                  @renote="handlers.renote"
                  @quote="handlers.quote"
                  @delete="async (n: NormalizedNote) => { if (await handlers.delete(n)) notifications = notifications.filter(x => x.note?.id !== n.id) }"
                  @edit="handlers.edit"
                  @bookmark="(n: NormalizedNote) => handlers.bookmark(n)"
                />
              </div>
            </div>
          </DynamicScrollerItem>
        </template>

        <template #after>
          <div v-if="isLoading && notifications.length > 0" class="loading-more">
            Loading...
          </div>
        </template>
      </DynamicScroller>
    </div>
  </DeckColumn>

  <Teleport to="body">
    <MkPostForm
      v-if="postForm.show.value && column.accountId"
      :account-id="column.accountId"
      :reply-to="postForm.replyTo.value"
      :renote-id="postForm.renoteId.value"
      :edit-note="postForm.editNote.value"
      @close="postForm.close"
      @posted="postForm.close"
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

.header-host {
  font-size: 0.75em;
  font-weight: normal;
  opacity: 0.6;
  max-width: 120px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
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

.notif-scroller :deep(.vue-recycle-scroller__item-view) {
  will-change: transform;
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
  width: 36px;
  height: 36px;
  border-radius: 50%;
  object-fit: cover;
  flex-shrink: 0;
}

.notif-avatar-placeholder {
  background: var(--nd-buttonBg);
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

/* Notifications without attached note — add bottom padding to header */
.notif-item:not(:has(.notif-note-wrap)) .notif-header {
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
</style>
