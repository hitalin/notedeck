<script setup lang="ts">
import {
  defineAsyncComponent,
  onMounted,
  onUnmounted,
  ref,
  shallowRef,
  useCssModule,
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
import { useNoteStore } from '@/stores/notes'
import { formatTime } from '@/utils/formatTime'
import { char2twemojiUrl } from '@/utils/twemoji'

const MkPostForm = defineAsyncComponent(
  () => import('@/components/common/MkPostForm.vue'),
)

const noteStore = useNoteStore()
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

function notifTypeClass(type: string): string | undefined {
  const map: Record<string, string> = {
    reaction: $style.notifTypeReaction,
    reply: $style.notifTypeReply,
    mention: $style.notifTypeMention,
    renote: $style.notifTypeRenote,
    quote: $style.notifTypeQuote,
    follow: $style.notifTypeFollow,
    followRequestAccepted: $style.notifTypeFollowRequestAccepted,
    receiveFollowRequest: $style.notifTypeReceiveFollowRequest,
  }
  return map[type]
}

const $style = useCssModule()

onMounted(() => {
  loadNotifications()
})

onUnmounted(() => {
  reactionUrlLookup.clear()
  twemojiUrlLookup.clear()
})
</script>

<template>
  <div :class="$style.notifContent">
    <!-- Per-account progress -->
    <div v-if="loadProgress.length > 0" :class="$style.notifProgress">
      <span
        v-for="(p, i) in loadProgress"
        :key="i"
        :class="[$style.progressDot, { [$style.done]: p.done }]"
        :title="p.host"
      />
    </div>

    <div
      v-if="isLoading && notifications.length === 0 && loadProgress.length === 0"
      :class="$style.notifEmpty"
    >
      Loading...
    </div>

    <div
      v-else-if="error && notifications.length === 0"
      :class="$style.notifEmpty"
    >
      <div :class="$style.notifEmptyIcon">
        <i class="ti ti-bell" />
      </div>
      <span>{{ error }}</span>
    </div>

    <NoteScroller
      v-else-if="notifications.length > 0"
      ref="noteScrollerRef"
      :items="notifications"
      :estimated-height="80"
      :class="$style.notifScroller"
      @scroll="handleScroll"
    >
      <template #default="{ item: notif, index }">
        <div :data-index="index">
          <div
            :class="[$style.notifItem, notifTypeClass(notif.type)]"
          >
            <!-- Notification header -->
            <div :class="$style.notifHeader">
              <i
                :class="[`ti ti-${notificationIcon(notif.type)}`, $style.notifIcon]"
              />

              <MkAvatar
                v-if="notif.user"
                :avatar-url="notif.user.avatarUrl"
                :decorations="notif.user.avatarDecorations"
                :size="36"
                :alt="notif.user.username ?? undefined"
                :class="$style.notifUserAvatar"
                @click="onNotifAvatarClick(notif, $event)"
              />

              <div :class="$style.notifMeta">
                <span v-if="notif.user" :class="$style.notifUserName">
                  <MkMfm
                    v-if="notif.user.name"
                    :text="notif.user.name"
                    :emojis="notif.user.emojis"
                    :server-host="notif._serverHost"
                  />
                  <template v-else>{{ notif.user.username }}</template>
                </span>
                <span :class="$style.notifLabel">{{ notificationLabel(notif.type) }}</span>
                <span
                  v-if="notif.type === 'reaction' && notif.reaction"
                  :class="$style.notifReaction"
                >
                  <img
                    v-if="getCachedReactionUrl(notif.reaction, notif)"
                    :src="getCachedReactionUrl(notif.reaction, notif)!"
                    :alt="notif.reaction"
                    :class="$style.notifReactionEmoji"
                    loading="lazy"
                  />
                  <img
                    v-else-if="getCachedTwemojiUrl(notif.reaction)"
                    :src="getCachedTwemojiUrl(notif.reaction)!"
                    :alt="notif.reaction"
                    :class="$style.notifReactionEmoji"
                    loading="lazy"
                  />
                  <span
                    v-else-if="notif.reaction.startsWith(':')"
                    :class="$style.notifReactionFallback"
                  >{{ notif.reaction }}</span>
                  <MkEmoji v-else :emoji="notif.reaction" :class="$style.notifReactionEmoji" />
                </span>
              </div>

              <span :class="$style.notifServerHost">{{ notif._serverHost }}</span>
              <span :class="$style.notifTime">{{ formatTime(notif.createdAt) }}</span>
            </div>

            <!-- Follow request actions -->
            <div
              v-if="notif.type === 'receiveFollowRequest' && notif.user"
              :class="$style.followRequestActions"
            >
              <template v-if="followRequestStates[notif.id]">
                <span :class="$style.followRequestDone">
                  {{ followRequestStates[notif.id] === 'accepted' ? 'Accepted' : 'Rejected' }}
                </span>
              </template>
              <template v-else>
                <button
                  :class="[$style.followRequestBtn, $style.acceptBtn]"
                  @click="handleFollowRequest(notif, 'accepted')"
                >
                  <i class="ti ti-check" /> Accept
                </button>
                <button
                  :class="[$style.followRequestBtn, $style.rejectBtn]"
                  @click="handleFollowRequest(notif, 'rejected')"
                >
                  <i class="ti ti-x" /> Reject
                </button>
              </template>
            </div>

            <!-- Attached note -->
            <div v-if="notif.note" :class="$style.notifNoteWrap">
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
        <div v-if="isLoading && notifications.length > 0" :class="$style.notifLoading">
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

<style lang="scss" module>
.notifContent {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
}

.notifProgress {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 6px 12px;
  flex-shrink: 0;
}

.progressDot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--nd-fg);
  opacity: 0.15;
  transition: opacity var(--nd-duration-slower), background var(--nd-duration-slower);

  &.done {
    background: var(--nd-accent);
    opacity: 0.8;
  }
}

.notifEmpty {
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

.notifEmptyIcon {
  font-size: 2em;
  opacity: 0.3;
}

.notifScroller {
  flex: 1;
  min-height: 0;
  overflow-x: clip;
  scrollbar-color: var(--nd-scrollbarHandle) transparent;
  scrollbar-width: thin;
}

.notifItem {
  border-bottom: 1px solid var(--nd-divider);
  border-left: 3px solid transparent;
}

.notifTypeReaction {
  border-left-color: var(--nd-love);

  .notifIcon {
    color: var(--nd-love);
  }
}

.notifTypeReply,
.notifTypeMention {
  border-left-color: var(--nd-accent);

  .notifIcon {
    color: var(--nd-accent);
  }
}

.notifTypeRenote,
.notifTypeQuote {
  border-left-color: var(--nd-renote);

  .notifIcon {
    color: var(--nd-renote);
  }
}

.notifTypeFollow,
.notifTypeFollowRequestAccepted {
  border-left-color: var(--nd-link);

  .notifIcon {
    color: var(--nd-link);
  }
}

.notifTypeReceiveFollowRequest {
  border-left-color: var(--nd-warn);

  .notifIcon {
    color: var(--nd-warn);
  }
}

.notifHeader {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 16px 0;
}

.notifIcon {
  flex-shrink: 0;
  opacity: 0.6;
}

.notifUserAvatar {
  cursor: pointer;
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
  /* fallback text for unknown custom emoji */
}

.notifServerHost {
  flex-shrink: 0;
  font-size: 0.7em;
  opacity: 0.35;
  max-width: 80px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.notifTime {
  flex-shrink: 0;
  font-size: 0.8em;
  opacity: 0.5;
  margin-left: auto;
}

.notifNoteWrap {
  padding: 0 8px 4px;

  :deep(.note-root) {
    font-size: 0.9em;
  }

  :deep(.article) {
    padding: 8px 12px 12px;
  }

  :deep(.avatar) {
    width: 36px;
    height: 36px;
    margin: 0 10px 0 0;
  }
}

/* Notifications without note or action buttons -- add bottom padding */
.notifItem:not(:has(.notifNoteWrap)):not(:has(.followRequestActions)) .notifHeader {
  padding-bottom: 12px;
}

.notifLoading {
  text-align: center;
  padding: 1rem;
  font-size: 0.8em;
  opacity: 0.4;
}

.followRequestActions {
  display: flex;
  gap: 8px;
  max-width: 300px;
  padding: 8px 16px 12px 60px;
}

.followRequestBtn {
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

@media (max-width: 500px) {
  .notifHeader {
    padding: 10px 12px 0;
    gap: 6px;
  }

  .notifNoteWrap {
    padding: 0 4px 4px;
  }

  .followRequestActions {
    padding-left: 48px;
  }
}

:global(html.nd-mobile) {
  .notifHeader {
    padding: 10px 12px 0;
    gap: 6px;
  }

  .notifNoteWrap {
    padding: 0 4px 4px;
  }

  .followRequestActions {
    padding-left: 48px;
  }
}

/* Empty placeholder classes for dynamic binding */
.done {}
</style>
