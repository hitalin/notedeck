<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import DeckColumn from './DeckColumn.vue'
import MkNote from '@/components/common/MkNote.vue'
import MkPostForm from '@/components/common/MkPostForm.vue'
import MkEmoji from '@/components/common/MkEmoji.vue'
import { createAdapter } from '@/adapters/registry'
import type {
  ChannelSubscription,
  NormalizedNote,
  NormalizedNotification,
  ServerAdapter,
} from '@/adapters/types'
import { useAccountsStore } from '@/stores/accounts'
import { useEmojisStore } from '@/stores/emojis'
import { useServersStore } from '@/stores/servers'
import { useThemeStore } from '@/stores/theme'
import type { DeckColumn as DeckColumnType } from '@/stores/deck'
import { char2twemojiUrl } from '@/utils/twemoji'

const props = defineProps<{
  column: DeckColumnType
}>()

const accountsStore = useAccountsStore()
const emojisStore = useEmojisStore()
const serversStore = useServersStore()
const themeStore = useThemeStore()

const account = computed(() =>
  accountsStore.accounts.find((a) => a.id === props.column.accountId),
)

const columnThemeVars = computed(() => {
  if (!props.column.accountId) return undefined
  const compiled = themeStore.getCompiledForAccount(props.column.accountId)
  if (!compiled) return undefined
  const style: Record<string, string> = {}
  for (const [key, value] of Object.entries(compiled)) {
    style[`--nd-${key}`] = value
  }
  return style
})

const notifications = ref<NormalizedNotification[]>([])
const isLoading = ref(false)
const error = ref<string | null>(null)

let adapter: ServerAdapter | null = null
let subscription: ChannelSubscription | null = null

function reactionUrl(reaction: string, notification: NormalizedNotification): string | null {
  if (reaction.startsWith(':') && reaction.endsWith(':')) {
    const shortcode = reaction.slice(1, -1).replace(/@\.$/, '')
    const note = notification.note
    if (note) {
      const url = note.reactionEmojis[shortcode] || note.emojis[shortcode]
      if (url) return url
    }
    return emojisStore.resolve(notification._serverHost, shortcode)
  }
  return null
}

function reactionTwemojiUrl(reaction: string): string | null {
  if (reaction.startsWith(':') && reaction.endsWith(':')) return null
  return char2twemojiUrl(reaction)
}

function formatTime(iso: string): string {
  const date = new Date(iso)
  const now = new Date()
  const diff = now.getTime() - date.getTime()
  const minutes = Math.floor(diff / 60000)

  if (minutes < 1) return 'now'
  if (minutes < 60) return `${minutes}m`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h`
  const days = Math.floor(hours / 24)
  return `${days}d`
}

const NOTIFICATION_ICONS: Record<string, string> = {
  reaction: 'M12 4v16M4 12h16',
  reply: 'M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z',
  renote: 'M17 1l4 4-4 4M3 11V9a4 4 0 0 1 4-4h14M7 23l-4-4 4-4M21 13v2a4 4 0 0 1-4 4H3',
  quote: 'M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z',
  mention: 'M12 21a9 9 0 100-18 9 9 0 000 18zM12 8v4M12 16h.01',
  follow: 'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM19 8v6M22 11h-6',
  followRequestAccepted: 'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM20 6l-4 4 2 2',
  pollEnded: 'M9 11l3 3L22 4M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11',
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
  return NOTIFICATION_ICONS[type] || 'M12 21a9 9 0 100-18 9 9 0 000 18zM12 8v4M12 16h.01'
}

function notificationLabel(type: string): string {
  return NOTIFICATION_LABELS[type] || type
}

async function connect() {
  const acc = account.value
  if (!acc) return
  error.value = null
  isLoading.value = true

  try {
    const serverInfo = await serversStore.getServerInfo(acc.host)
    adapter = createAdapter(serverInfo, acc.token, acc.id)

    if (!emojisStore.has(acc.host)) {
      adapter.api.getServerEmojis().then((emojis) => {
        emojisStore.set(acc.host, emojis)
      }).catch(() => {})
    }

    const fetched = await adapter.api.getNotifications()
    notifications.value = fetched

    adapter.stream.connect()
    subscription = adapter.stream.subscribeMain((event) => {
      if (event.type === 'notification') {
        const raw = event.body as {
          id: string
          createdAt: string
          type: string
          user?: unknown
          note?: unknown
          reaction?: string
        }
        // Normalize inline (matches getNotifications pattern)
        const normalized: NormalizedNotification = {
          id: raw.id,
          _accountId: acc.id,
          _serverHost: acc.host,
          createdAt: raw.createdAt,
          type: raw.type,
          reaction: raw.reaction,
        }
        // User and note need normalization - use raw for display
        if (raw.user) {
          const u = raw.user as { id: string; username: string; host: string | null; name: string | null; avatarUrl: string | null }
          normalized.user = {
            id: u.id,
            username: u.username,
            host: u.host,
            name: u.name,
            avatarUrl: u.avatarUrl,
          }
        }
        if (raw.note) {
          // Re-fetch to get properly normalized note
          adapter?.api.getNote((raw.note as { id: string }).id).then((note) => {
            normalized.note = note
            notifications.value = [normalized, ...notifications.value]
          }).catch(() => {
            // Fallback: add without note
            notifications.value = [normalized, ...notifications.value]
          })
        } else {
          notifications.value = [normalized, ...notifications.value]
        }
      }
    })
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e)
  } finally {
    isLoading.value = false
  }
}

function disconnect() {
  subscription?.dispose()
  subscription = null
  adapter?.stream.disconnect()
  adapter = null
}

async function loadMore() {
  if (!adapter || isLoading.value || notifications.value.length === 0) return
  const last = notifications.value[notifications.value.length - 1]
  isLoading.value = true
  try {
    const older = await adapter.api.getNotifications({ untilId: last.id })
    notifications.value = [...notifications.value, ...older]
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e)
  } finally {
    isLoading.value = false
  }
}

function onScroll(e: Event) {
  const el = e.target as HTMLElement
  if (el.scrollTop + el.clientHeight >= el.scrollHeight - 300) {
    loadMore()
  }
}

// Post form state (for reply from notification)
const showPostForm = ref(false)
const postFormReplyTo = ref<NormalizedNote | undefined>()

async function handleReaction(note: NormalizedNote, reaction: string) {
  if (!adapter) return
  try {
    if (note.myReaction === reaction) {
      await adapter.api.deleteReaction(note.id)
      if (note.reactions[reaction] > 1) {
        note.reactions[reaction]--
      } else {
        delete note.reactions[reaction]
      }
      note.myReaction = null
    } else {
      if (note.myReaction) {
        await adapter.api.deleteReaction(note.id)
        const prev = note.myReaction
        if (note.reactions[prev] > 1) {
          note.reactions[prev]--
        } else {
          delete note.reactions[prev]
        }
      }
      await adapter.api.createReaction(note.id, reaction)
      note.reactions[reaction] = (note.reactions[reaction] ?? 0) + 1
      note.myReaction = reaction
    }
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
  showPostForm.value = true
}

function handleQuote(note: NormalizedNote) {
  postFormReplyTo.value = undefined
  showPostForm.value = true
}

function closePostForm() {
  showPostForm.value = false
  postFormReplyTo.value = undefined
}

onMounted(() => {
  connect()
})

onUnmounted(() => {
  disconnect()
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
      {{ error }}
    </div>

    <div v-else class="notif-body" @scroll="onScroll">
      <div v-if="isLoading && notifications.length === 0" class="column-empty">
        Loading...
      </div>

      <div
        v-for="notif in notifications"
        :key="notif.id"
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
              <img v-if="reactionUrl(notif.reaction, notif)" :src="reactionUrl(notif.reaction, notif)!" :alt="notif.reaction" class="notif-reaction-emoji" />
              <img v-else-if="reactionTwemojiUrl(notif.reaction)" :src="reactionTwemojiUrl(notif.reaction)!" :alt="notif.reaction" class="notif-reaction-emoji" />
              <MkEmoji v-else :emoji="notif.reaction" class="notif-reaction-emoji" />
            </span>
          </div>

          <span class="notif-time">{{ formatTime(notif.createdAt) }}</span>
        </div>

        <!-- Attached note (for reaction, reply, renote, quote, mention) -->
        <div v-if="notif.note" class="notif-note-wrap">
          <MkNote
            :note="notif.note"
            @react="(reaction: string) => handleReaction(notif.note!, reaction)"
            @reply="handleReply"
            @renote="handleRenote"
            @quote="handleQuote"
          />
        </div>
      </div>

      <div v-if="isLoading && notifications.length > 0" class="loading-more">
        Loading...
      </div>
    </div>
  </DeckColumn>

  <Teleport to="body">
    <MkPostForm
      v-if="showPostForm && column.accountId"
      :account-id="column.accountId"
      :reply-to="postFormReplyTo"
      @close="closePostForm"
      @posted="closePostForm"
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
  overflow-y: auto;
  overflow-x: clip;
  scrollbar-color: var(--nd-scrollbarHandle) transparent;
  scrollbar-width: thin;
}

.notif-item {
  border-bottom: 1px solid var(--nd-divider);
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
  width: 28px;
  height: 28px;
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
  height: 1.4em;
  vertical-align: middle;
  object-fit: contain;
}

.notif-reaction-emoji :deep(.twemoji) {
  height: 1.4em;
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
