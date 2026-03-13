<script setup lang="ts">
import {
  defineAsyncComponent,
  onMounted,
  onUnmounted,
  ref,
  shallowRef,
} from 'vue'
import type { NormalizedNote, NormalizedNotification } from '@/adapters/types'
import MkAvatar from '@/components/common/MkAvatar.vue'
import MkEmoji from '@/components/common/MkEmoji.vue'
import MkMfm from '@/components/common/MkMfm.vue'
import MkNote from '@/components/common/MkNote.vue'
import NoteScroller from '@/components/common/NoteScroller.vue'
import { useEmojiResolver } from '@/composables/useEmojiResolver'
import { useMultiAccountAdapters } from '@/composables/useMultiAccountAdapters'
import { useNavigation } from '@/composables/useNavigation'
import { useNoteActions } from '@/composables/useNoteActions'
import { useAccountsStore } from '@/stores/accounts'
import { noteStore } from '@/stores/notes'
import { formatTime } from '@/utils/formatTime'
import { char2twemojiUrl } from '@/utils/twemoji'

const MkPostForm = defineAsyncComponent(
  () => import('@/components/common/MkPostForm.vue'),
)

const accountsStore = useAccountsStore()
const { getOrCreate } = useMultiAccountAdapters()
const { navigateToUser: navToUser } = useNavigation()
const { reactionUrl: reactionUrlRaw } = useEmojiResolver()

const notifications = shallowRef<NormalizedNotification[]>([])

function onMutated(note: NormalizedNote) {
  noteStore.update(note.id, { ...note })
  // Update notes inside notifications
  notifications.value = notifications.value.map((n) => {
    if (!n.note) return n
    if (n.note.id === note.id) return { ...n, note: { ...note } }
    return n
  })
}

const { postForm, handlers } = useNoteActions(
  (note) => getOrCreate(note._accountId),
  onMutated,
)

const MAX_NOTIFICATIONS = 500
const isLoading = ref(false)
const error = ref<string | null>(null)
const noteScrollerRef = ref<{ getElement: () => HTMLElement | null } | null>(
  null,
)
const followRequestStates = ref<Record<string, 'accepted' | 'rejected'>>({})

// Per-account progress
const loadProgress = ref<{ host: string; done: boolean }[]>([])

// Merge notifications: dedup by id, sort by createdAt desc
function mergeNotifications(
  existing: NormalizedNotification[],
  incoming: NormalizedNotification[],
): NormalizedNotification[] {
  const seen = new Set(existing.map((n) => n.id))
  const merged = [...existing]
  for (const notif of incoming) {
    if (!seen.has(notif.id)) {
      merged.push(notif)
      seen.add(notif.id)
    }
  }
  return merged.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
}

// Reaction emoji caching (same pattern as DeckNotificationColumn)
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
  return NOTIFICATION_ICONS[type] || 'bell'
}

function notificationLabel(type: string): string {
  return NOTIFICATION_LABELS[type] || type
}

// Per-account oldest notification tracking for pagination
const lastNotifIds = new Map<string, string>()
const lastNotifCreatedAts = new Map<string, string>()

function updateLastNotifIds(notifList: NormalizedNotification[]) {
  for (const notif of notifList) {
    const accId = notif._accountId
    if (!accId) continue
    const existingAt = lastNotifCreatedAts.get(accId)
    if (!existingAt || notif.createdAt < existingAt) {
      lastNotifIds.set(accId, notif.id)
      lastNotifCreatedAts.set(accId, notif.createdAt)
    }
  }
}

async function loadNotifications() {
  const accounts = accountsStore.accounts
  if (accounts.length === 0) return

  isLoading.value = true
  error.value = null
  lastNotifIds.clear()
  lastNotifCreatedAts.clear()

  loadProgress.value = accounts.map((acc) => ({
    host: acc.host,
    done: false,
  }))

  const results = await Promise.allSettled(
    accounts.map(async (acc, i) => {
      const adapter = await getOrCreate(acc.id)
      if (!adapter) return []
      try {
        return await adapter.api.getNotifications()
      } finally {
        loadProgress.value = loadProgress.value.map((p, j) =>
          j === i ? { ...p, done: true } : p,
        )
      }
    }),
  )

  const allNotifs: NormalizedNotification[] = []
  for (const r of results) {
    if (r.status === 'fulfilled') allNotifs.push(...r.value)
  }

  notifications.value = mergeNotifications([], allNotifs)
  updateLastNotifIds(notifications.value)

  if (notifications.value.length === 0) {
    error.value = 'No notifications'
  }

  isLoading.value = false
  loadProgress.value = []
}

async function loadMore() {
  if (isLoading.value || notifications.value.length === 0) return
  isLoading.value = true

  const accounts = accountsStore.accounts
  const results = await Promise.allSettled(
    accounts.map(async (acc) => {
      const adapter = await getOrCreate(acc.id)
      if (!adapter) return []
      const untilId = lastNotifIds.get(acc.id)
      if (!untilId) return []
      return adapter.api.getNotifications({ untilId })
    }),
  )

  const olderNotifs: NormalizedNotification[] = []
  for (const r of results) {
    if (r.status === 'fulfilled') olderNotifs.push(...r.value)
  }

  if (olderNotifs.length > 0) {
    notifications.value = mergeNotifications(notifications.value, olderNotifs)
    updateLastNotifIds(olderNotifs)
  }

  isLoading.value = false
}

// Scroll handler
let lastScrollCheck = 0
function handleScroll() {
  const now = Date.now()
  if (now - lastScrollCheck < 200) return
  lastScrollCheck = now
  const el = noteScrollerRef.value?.getElement()
  if (!el) return
  if (el.scrollTop + el.clientHeight >= el.scrollHeight - 300) {
    loadMore()
  }
}

function onNotifAvatarClick(notif: NormalizedNotification, e: MouseEvent) {
  e.stopPropagation()
  if (notif.user) navToUser(notif._accountId, notif.user.id)
}

async function removeNote(note: NormalizedNote) {
  const id = note.id
  const prevNotifs = notifications.value
  notifications.value = notifications.value.filter(
    (x) => x.note?.id !== id && x.note?.renoteId !== id,
  )
  const ok = await handlers.delete(note)
  if (!ok) notifications.value = prevNotifs
  else noteStore.remove(id)
}

async function handlePosted(editedNoteId?: string) {
  postForm.close()
  if (editedNoteId) {
    const notif = notifications.value.find((n) => n.note?.id === editedNoteId)
    if (!notif) return
    const adapter = await getOrCreate(notif._accountId)
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
  if (!notif.user) return
  const adapter = await getOrCreate(notif._accountId)
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
    console.error('[notifications:followRequest]', e)
  }
}

onMounted(() => {
  loadNotifications()
})

onUnmounted(() => {
  reactionUrlLookup.clear()
  twemojiUrlLookup.clear()
})
</script>

<template>
  <div class="notif-content">
    <!-- Per-account progress -->
    <div v-if="loadProgress.length > 0" class="notif-progress">
      <span
        v-for="(p, i) in loadProgress"
        :key="i"
        class="progress-dot"
        :class="{ done: p.done }"
        :title="p.host"
      />
    </div>

    <div
      v-if="isLoading && notifications.length === 0 && loadProgress.length === 0"
      class="notif-empty"
    >
      Loading...
    </div>

    <div
      v-else-if="error && notifications.length === 0"
      class="notif-empty"
    >
      <div class="notif-empty-icon">
        <i class="ti ti-bell" />
      </div>
      <span>{{ error }}</span>
    </div>

    <NoteScroller
      v-else-if="notifications.length > 0"
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
              <i
                :class="`ti ti-${notificationIcon(notif.type)}`"
                class="notif-icon"
              />

              <MkAvatar
                v-if="notif.user"
                :avatar-url="notif.user.avatarUrl"
                :decorations="notif.user.avatarDecorations"
                :size="36"
                :alt="notif.user.username ?? undefined"
                class="notif-user-avatar"
                @click="onNotifAvatarClick(notif, $event)"
              />

              <div class="notif-meta">
                <span v-if="notif.user" class="notif-user-name">
                  <MkMfm
                    v-if="notif.user.name"
                    :text="notif.user.name"
                    :emojis="notif.user.emojis"
                    :server-host="notif._serverHost"
                  />
                  <template v-else>{{ notif.user.username }}</template>
                </span>
                <span class="notif-label">{{ notificationLabel(notif.type) }}</span>
                <span
                  v-if="notif.type === 'reaction' && notif.reaction"
                  class="notif-reaction"
                >
                  <img
                    v-if="getCachedReactionUrl(notif.reaction, notif)"
                    :src="getCachedReactionUrl(notif.reaction, notif)!"
                    :alt="notif.reaction"
                    class="notif-reaction-emoji"
                    loading="lazy"
                  />
                  <img
                    v-else-if="getCachedTwemojiUrl(notif.reaction)"
                    :src="getCachedTwemojiUrl(notif.reaction)!"
                    :alt="notif.reaction"
                    class="notif-reaction-emoji"
                    loading="lazy"
                  />
                  <span
                    v-else-if="notif.reaction.startsWith(':')"
                    class="notif-reaction-fallback"
                  >{{ notif.reaction }}</span>
                  <MkEmoji v-else :emoji="notif.reaction" class="notif-reaction-emoji" />
                </span>
              </div>

              <span class="notif-server-host">{{ notif._serverHost }}</span>
              <span class="notif-time">{{ formatTime(notif.createdAt) }}</span>
            </div>

            <!-- Follow request actions -->
            <div
              v-if="notif.type === 'receiveFollowRequest' && notif.user"
              class="follow-request-actions"
            >
              <template v-if="followRequestStates[notif.id]">
                <span class="follow-request-done">
                  {{ followRequestStates[notif.id] === 'accepted' ? 'Accepted' : 'Rejected' }}
                </span>
              </template>
              <template v-else>
                <button
                  class="follow-request-btn accept-btn"
                  @click="handleFollowRequest(notif, 'accepted')"
                >
                  <i class="ti ti-check" /> Accept
                </button>
                <button
                  class="follow-request-btn reject-btn"
                  @click="handleFollowRequest(notif, 'rejected')"
                >
                  <i class="ti ti-x" /> Reject
                </button>
              </template>
            </div>

            <!-- Attached note -->
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
        <div v-if="isLoading && notifications.length > 0" class="notif-loading">
          Loading more...
        </div>
      </template>
    </NoteScroller>
  </div>

  <Teleport to="body">
    <MkPostForm
      v-if="postForm.show.value && postForm.accountId.value"
      :account-id="postForm.accountId.value"
      :reply-to="postForm.replyTo.value"
      :renote-id="postForm.renoteId.value"
      :edit-note="postForm.editNote.value"
      @close="postForm.close"
      @posted="handlePosted"
    />
  </Teleport>
</template>

<style scoped>
.notif-content {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
}

.notif-progress {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 6px 12px;
  flex-shrink: 0;
}

.progress-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--nd-fg);
  opacity: 0.15;
  transition: opacity var(--nd-duration-slower), background var(--nd-duration-slower);
}

.progress-dot.done {
  background: var(--nd-accent);
  opacity: 0.8;
}

.notif-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 2rem 1rem;
  color: var(--nd-fg);
  opacity: 0.5;
  font-size: 0.85em;
}

.notif-empty-icon {
  font-size: 2em;
  opacity: 0.3;
}

.notif-scroller {
  flex: 1;
  min-height: 0;
  overflow-x: clip;
  scrollbar-color: var(--nd-scrollbarHandle) transparent;
  scrollbar-width: thin;
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

.notif-type-receiveFollowRequest {
  border-left-color: var(--nd-warn);
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

.notif-type-receiveFollowRequest .notif-icon {
  color: var(--nd-warn);
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

.notif-server-host {
  flex-shrink: 0;
  font-size: 0.7em;
  opacity: 0.35;
  max-width: 80px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.notif-time {
  flex-shrink: 0;
  font-size: 0.8em;
  opacity: 0.5;
  margin-left: auto;
}

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

/* Notifications without note or action buttons — add bottom padding */
.notif-item:not(:has(.notif-note-wrap)):not(:has(.follow-request-actions)) .notif-header {
  padding-bottom: 12px;
}

.notif-loading {
  text-align: center;
  padding: 1rem;
  font-size: 0.8em;
  opacity: 0.4;
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
  min-height: 44px;
  padding: 7px 14px;
  font-weight: bold;
  font-size: 0.85em;
  border: none;
  border-radius: var(--nd-radius-full);
  cursor: pointer;
  transition: background var(--nd-duration-fast) ease;
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
  background: var(--nd-love-subtle);
}

.follow-request-done {
  font-size: 0.85em;
  opacity: 0.6;
  font-style: italic;
}

@media (max-width: 500px) {
  .notif-header {
    padding: 10px 12px 0;
    gap: 6px;
  }

  .notif-note-wrap {
    padding: 0 4px 4px;
  }

  .follow-request-actions {
    padding-left: 48px;
  }
}

/* Mobile platform (viewport may exceed 500px) */
html.nd-mobile .notif-header {
  padding: 10px 12px 0;
  gap: 6px;
}

html.nd-mobile .notif-note-wrap {
  padding: 0 4px 4px;
}

html.nd-mobile .follow-request-actions {
  padding-left: 48px;
}
</style>
