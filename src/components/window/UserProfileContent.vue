<script setup lang="ts">
import { openUrl } from '@tauri-apps/plugin-opener'
import { computed, onMounted, ref, shallowRef } from 'vue'
import { createAdapter } from '@/adapters/registry'
import type {
  NormalizedNote,
  NormalizedUserDetail,
  ServerAdapter,
} from '@/adapters/types'
import MkMfm from '@/components/common/MkMfm.vue'
import MkNote from '@/components/common/MkNote.vue'
import MkPostForm from '@/components/common/MkPostForm.vue'
import { useAccountsStore } from '@/stores/accounts'
import { useEmojisStore } from '@/stores/emojis'
import { useServersStore } from '@/stores/servers'
import { AppError } from '@/utils/errors'
import { toggleFollow } from '@/utils/toggleFollow'
import { toggleReaction } from '@/utils/toggleReaction'
import { safeCssUrl } from '@/utils/url'

const props = defineProps<{
  accountId: string
  userId: string
}>()

const accountsStore = useAccountsStore()
const emojisStore = useEmojisStore()
const serversStore = useServersStore()

const user = ref<NormalizedUserDetail | null>(null)
const MAX_PROFILE_NOTES = 500
const notes = shallowRef<NormalizedNote[]>([])
const pinnedNotes = shallowRef<NormalizedNote[]>([])
const pinnedNoteIds = ref<string[]>([])
const isLoading = ref(true)
const isLoadingNotes = ref(false)
const error = ref<AppError | null>(null)

const account = computed(() =>
  accountsStore.accounts.find((a) => a.id === props.accountId),
)
const isOwnProfile = computed(() => account.value?.userId === props.userId)

let adapter: ServerAdapter | null = null

onMounted(async () => {
  const account = accountsStore.accounts.find((a) => a.id === props.accountId)
  if (!account) {
    error.value = new AppError('ACCOUNT_NOT_FOUND', 'Account not found')
    isLoading.value = false
    return
  }

  try {
    const serverInfo = await serversStore.getServerInfo(account.host)
    const a = createAdapter(serverInfo, account.id)
    adapter = a
    emojisStore.ensureLoaded(account.host, () => a.api.getServerEmojis())
    user.value = await adapter.api.getUserDetail(props.userId)
    const [userNotes, userPinnedNoteIds] = await Promise.all([
      adapter.api.getUserNotes(props.userId, { limit: 20 }),
      adapter.api.getUserPinnedNoteIds(props.userId),
    ])
    notes.value = userNotes
    pinnedNoteIds.value = userPinnedNoteIds
    if (userPinnedNoteIds.length > 0) {
      const pinned = await Promise.all(
        userPinnedNoteIds.map((id) => adapter?.api.getNote(id)),
      )
      pinnedNotes.value = pinned
    }
  } catch (e) {
    error.value = AppError.from(e)
  } finally {
    isLoading.value = false
  }
})

async function loadMoreNotes() {
  if (!adapter || isLoadingNotes.value || notes.value.length === 0) return
  if (notes.value.length >= MAX_PROFILE_NOTES) return
  const last = notes.value.at(-1)
  if (!last) return
  isLoadingNotes.value = true
  try {
    const older = await adapter.api.getUserNotes(props.userId, {
      limit: 20,
      untilId: last.id,
    })
    notes.value = [...notes.value, ...older]
  } catch (e) {
    error.value = AppError.from(e)
  } finally {
    isLoadingNotes.value = false
  }
}

let lastScrollCheck = 0
function onScroll(e: Event) {
  const now = Date.now()
  if (now - lastScrollCheck < 200) return
  lastScrollCheck = now
  const el = e.target as HTMLElement
  if (el.scrollTop + el.clientHeight >= el.scrollHeight - 300) {
    loadMoreNotes()
  }
}

function formatDate(iso: string): string {
  if (!iso) return ''
  return new Date(iso).toLocaleDateString()
}

function formatCount(n: number): string {
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`
  return String(n)
}

function formatBirthday(dateStr: string): string {
  if (!dateStr) return ''
  const parts = dateStr.split('-').map(Number)
  const year = parts[0] ?? 0
  const month = parts[1] ?? 1
  const day = parts[2] ?? 1
  const date = new Date(year, month - 1, day)
  return date.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
}

function displayUrl(url: string): string {
  try {
    const u = new URL(url)
    return u.hostname + (u.pathname !== '/' ? u.pathname : '')
  } catch {
    return url
  }
}

// Post form state
const showPostForm = ref(false)
const postFormReplyTo = ref<NormalizedNote | undefined>()
const postFormRenoteId = ref<string | undefined>()
const postFormEditNote = ref<NormalizedNote | undefined>()

const isFollowLoading = ref(false)

async function handleToggleFollow() {
  if (!adapter || !user.value || isOwnProfile.value) return
  isFollowLoading.value = true
  try {
    await toggleFollow(adapter.api, user.value)
  } catch (e) {
    error.value = AppError.from(e)
  } finally {
    isFollowLoading.value = false
  }
}

async function handleReaction(reaction: string, note: NormalizedNote) {
  if (!adapter) return
  try {
    await toggleReaction(adapter.api, note, reaction)
  } catch (e) {
    error.value = AppError.from(e)
  }
}

async function handleRenote(target: NormalizedNote) {
  if (!adapter) return
  try {
    await adapter.api.createNote({ renoteId: target.id })
  } catch (e) {
    error.value = AppError.from(e)
  }
}

function handleReply(target: NormalizedNote) {
  postFormReplyTo.value = target
  postFormRenoteId.value = undefined
  showPostForm.value = true
}

function handleQuote(target: NormalizedNote) {
  postFormReplyTo.value = undefined
  postFormRenoteId.value = target.id
  showPostForm.value = true
}

function handleEdit(target: NormalizedNote) {
  postFormReplyTo.value = undefined
  postFormRenoteId.value = undefined
  postFormEditNote.value = target
  showPostForm.value = true
}

async function handlePin(target: NormalizedNote) {
  if (!adapter) return
  try {
    const isPinned = pinnedNoteIds.value.includes(target.id)
    if (isPinned) {
      await adapter.api.unpinNote(target.id)
      pinnedNoteIds.value = pinnedNoteIds.value.filter((id) => id !== target.id)
      pinnedNotes.value = pinnedNotes.value.filter((n) => n.id !== target.id)
    } else {
      await adapter.api.pinNote(target.id)
      pinnedNoteIds.value = [...pinnedNoteIds.value, target.id]
      pinnedNotes.value = [...pinnedNotes.value, target]
    }
  } catch (e) {
    error.value = AppError.from(e)
  }
}

async function handleDelete(target: NormalizedNote) {
  if (!adapter) return
  try {
    await adapter.api.deleteNote(target.id)
    const id = target.id
    notes.value = notes.value.filter((n) => n.id !== id && n.renoteId !== id)
  } catch (e) {
    error.value = AppError.from(e)
  }
}

function closePostForm() {
  showPostForm.value = false
  postFormReplyTo.value = undefined
  postFormRenoteId.value = undefined
  postFormEditNote.value = undefined
}

async function handlePosted(editedNoteId?: string) {
  closePostForm()
  if (editedNoteId && adapter) {
    try {
      const updated = await adapter.api.getNote(editedNoteId)
      notes.value = notes.value.map((n) =>
        n.id === editedNoteId
          ? updated
          : n.renoteId === editedNoteId
            ? { ...n, renote: updated }
            : n,
      )
    } catch {
      // note may have been deleted
    }
  }
}
</script>

<template>
  <div class="user-profile-content" @scroll="onScroll">
    <div v-if="isLoading" class="state-message">読み込み中...</div>

    <div v-else-if="error" class="state-message state-error">
      <p>{{ error.message }}</p>
    </div>

    <template v-else-if="user">
      <div class="profile-container">
        <!-- Banner area -->
        <div class="banner-area">
          <div
            v-if="user.bannerUrl"
            class="banner"
            :style="{ backgroundImage: safeCssUrl(user.bannerUrl) }"
          />
          <div v-else class="banner banner-empty" />

          <!-- Gradient fade -->
          <div class="banner-fade" />

          <!-- "Follows you" badge on banner -->
          <div v-if="user.isFollowed" class="followed-badge">フォローされています</div>

          <!-- Name overlay on banner (desktop) -->
          <div class="banner-title">
            <div class="banner-name">
              <MkMfm v-if="user.name" :text="user.name" :emojis="user.emojis" :server-host="account?.host" />
              <template v-else>{{ user.username }}</template>
            </div>
            <div class="banner-bottom">
              <span class="banner-username">@{{ user.username }}{{ user.host ? `@${user.host}` : '' }}</span>
              <span v-if="user.isBot" class="banner-badge">Bot</span>
              <span v-if="user.isCat" class="banner-badge">Cat</span>
            </div>
          </div>

          <!-- Avatar -->
          <img
            v-if="user.avatarUrl"
            :src="user.avatarUrl"
            class="user-avatar"
          />
          <div v-else class="user-avatar avatar-placeholder" />

          <!-- Banner actions -->
          <div class="banner-actions">
            <button class="_button banner-action-btn" :title="isOwnProfile ? 'プロフィールを編集' : 'Web UIで開く'" @click="openUrl(`https://${account?.host}/${isOwnProfile ? 'settings/profile' : `@${user.username}${user.host ? `@${user.host}` : ''}`}`)">
              <i :class="isOwnProfile ? 'ti ti-pencil' : 'ti ti-external-link'" />
            </button>
            <button
              v-if="!isOwnProfile"
              class="banner-follow-btn _button"
              :class="{ following: user.isFollowing }"
              :disabled="isFollowLoading"
              @click="handleToggleFollow"
            >
              {{ user.isFollowing ? 'フォロー中' : 'フォロー' }}
            </button>
          </div>
        </div>

        <!-- Mobile title (shown below avatar on narrow screens) -->
        <div class="mobile-title">
          <div class="mobile-name">
            <MkMfm v-if="user.name" :text="user.name" :emojis="user.emojis" :server-host="account?.host" />
            <template v-else>{{ user.username }}</template>
          </div>
          <div class="mobile-username">@{{ user.username }}{{ user.host ? `@${user.host}` : '' }}</div>
          <div v-if="user.isBot || user.isCat" class="mobile-badges">
            <span v-if="user.isBot" class="badge">Bot</span>
            <span v-if="user.isCat" class="badge badge-cat">Cat</span>
          </div>
        </div>

        <!-- Roles -->
        <div v-if="user.roles?.length" class="roles">
          <span
            v-for="role in user.roles"
            :key="role.id"
            class="role"
            :style="role.color ? { borderColor: role.color } : {}"
          >
            <img v-if="role.iconUrl" :src="role.iconUrl" class="role-icon" />
            {{ role.name }}
          </span>
        </div>

        <!-- Description -->
        <div v-if="user.description" class="description">
          <MkMfm :text="user.description" :emojis="user.emojis" :server-host="account?.host" />
        </div>

        <!-- Custom fields -->
        <div v-if="user.fields?.length" class="profile-fields">
          <div v-for="(field, i) in user.fields" :key="i" class="profile-field">
            <div class="profile-field-name">{{ field.name }}</div>
            <div class="profile-field-value">
              <MkMfm :text="field.value" :emojis="user.emojis" :server-host="account?.host" />
            </div>
          </div>
        </div>

        <!-- Profile info (birthday, location, url, registration date) -->
        <div v-if="user.birthday || user.location || user.url || user.createdAt" class="profile-info">
          <div v-if="user.birthday" class="profile-info-item">
            <i class="ti ti-cake" />
            <span>{{ formatBirthday(user.birthday) }}</span>
          </div>
          <div v-if="user.location" class="profile-info-item">
            <i class="ti ti-map-pin" />
            <span>{{ user.location }}</span>
          </div>
          <div v-if="user.url" class="profile-info-item">
            <i class="ti ti-link" />
            <button class="_button profile-info-link" @click="openUrl(user.url!)">
              {{ displayUrl(user.url!) }}
            </button>
          </div>
          <div v-if="user.createdAt" class="profile-info-item">
            <i class="ti ti-calendar" />
            <span>{{ formatDate(user.createdAt) }}</span>
          </div>
        </div>

        <!-- Stats -->
        <div class="stats">
          <div class="stat">
            <b>{{ formatCount(user.notesCount) }}</b>
            <span>ノート</span>
          </div>
          <button class="stat stat-link _button" @click="openUrl(`https://${account?.host}/@${user.username}${user.host ? `@${user.host}` : ''}/following`)">
            <b>{{ formatCount(user.followingCount) }}</b>
            <span>フォロー</span>
          </button>
          <button class="stat stat-link _button" @click="openUrl(`https://${account?.host}/@${user.username}${user.host ? `@${user.host}` : ''}/followers`)">
            <b>{{ formatCount(user.followersCount) }}</b>
            <span>フォロワー</span>
          </button>
        </div>

        <!-- Pinned notes -->
        <div v-if="pinnedNotes.length > 0" class="pinned-section">
          <div class="pinned-header">
            <i class="ti ti-pin" />
            ピン留め
          </div>
          <MkNote
            v-for="note in pinnedNotes"
            :key="'pinned-' + note.id"
            :note="note"
            :pinned-note-ids="pinnedNoteIds"
            @react="handleReaction"
            @reply="handleReply"
            @renote="handleRenote"
            @quote="handleQuote"
            @delete="handleDelete"
            @edit="handleEdit"
            @pin="handlePin"
          />
        </div>

        <!-- User's notes -->
        <div class="notes-section">
          <div class="notes-tab">ノート</div>

          <MkNote
            v-for="note in notes"
            :key="note.id"
            :note="note"
            :pinned-note-ids="pinnedNoteIds"
            @react="handleReaction"
            @reply="handleReply"
            @renote="handleRenote"
            @quote="handleQuote"
            @delete="handleDelete"
            @edit="handleEdit"
            @pin="handlePin"
          />

          <div v-if="isLoadingNotes" class="state-message">
            Loading...
          </div>

          <div v-if="!isLoadingNotes && notes.length === 0" class="state-message">
            No notes yet
          </div>
        </div>
      </div>
    </template>

    <Teleport to="body">
      <MkPostForm
        v-if="showPostForm"
        :account-id="accountId"
        :reply-to="postFormReplyTo"
        :renote-id="postFormRenoteId"
        :edit-note="postFormEditNote"
        @close="closePostForm"
        @posted="handlePosted"
      />
    </Teleport>
  </div>
</template>

<style scoped>
.user-profile-content {
  height: 100%;
  overflow-y: auto;
  background: var(--nd-bg);
}

/* Profile container with container queries */
.profile-container {
  max-width: 800px;
  margin: 0 auto;
  container-type: inline-size;
}

/* Banner */
.banner-area {
  position: relative;
  --bannerHeight: 250px;
}

.banner {
  width: 100%;
  height: var(--bannerHeight);
  background-color: #4c5e6d;
  background-size: cover;
  background-position: center 50%;
}

.banner-empty {
  background: linear-gradient(135deg, #4c5e6d, #6b8a9e);
}

.banner-fade {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  height: 78px;
  background: linear-gradient(transparent, rgba(0, 0, 0, 0.7));
  pointer-events: none;
}

/* "Follows you" badge on banner */
.followed-badge {
  position: absolute;
  top: 12px;
  left: 12px;
  padding: 4px 12px;
  border-radius: 999px;
  font-size: 0.75em;
  font-weight: bold;
  color: #fff;
  background: rgba(0, 0, 0, 0.35);
  backdrop-filter: blur(8px);
}

/* Name overlay on banner (desktop only) */
.banner-title {
  position: absolute;
  bottom: 0;
  left: 0;
  width: 100%;
  padding: 0 0 8px 154px;
  color: #fff;
  pointer-events: none;
}

.banner-name {
  line-height: 32px;
  font-weight: bold;
  font-size: 1.8em;
  filter: drop-shadow(0 0 4px #000);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.banner-bottom {
  line-height: 20px;
  opacity: 0.8;
  filter: drop-shadow(0 0 4px #000);
}

.banner-username {
  font-weight: bold;
  margin-right: 16px;
}

.banner-badge {
  display: inline-block;
  margin-right: 8px;
  padding: 1px 8px;
  border-radius: 999px;
  font-size: 0.8em;
  background: rgba(255, 255, 255, 0.2);
}

/* Banner actions (top-right, Misskey style) */
.banner-actions {
  position: absolute;
  top: 12px;
  right: 12px;
  display: flex;
  align-items: center;
  gap: 4px;
  background: rgba(0, 0, 0, 0.2);
  backdrop-filter: blur(8px);
  padding: 8px;
  border-radius: 24px;
  z-index: 3;
}

.banner-action-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 31px;
  height: 31px;
  color: #fff;
  text-shadow: 0 0 8px #000;
  font-size: 16px;
}

.banner-follow-btn {
  padding: 6px 16px;
  border-radius: 999px;
  font-size: 0.85em;
  font-weight: bold;
  color: #fff;
  background: var(--nd-accent);
  margin-left: 4px;
}

.banner-follow-btn:hover {
  opacity: 0.85;
}

.banner-follow-btn:disabled {
  opacity: 0.5;
}

.banner-follow-btn.following {
  background: rgba(255, 255, 255, 0.2);
  color: #fff;
}

/* Avatar */
.user-avatar {
  position: absolute;
  top: 170px;
  left: 16px;
  width: 120px;
  height: 120px;
  border-radius: 50%;
  object-fit: cover;
  box-shadow: 1px 1px 3px rgba(0, 0, 0, 0.2);
  border: 4px solid var(--nd-bg);
  z-index: 2;
}

.avatar-placeholder {
  background: var(--nd-buttonBg);
}

/* Mobile title (hidden on desktop) */
.mobile-title {
  display: none;
}

/* Description */
.description {
  padding: 24px 24px 0 154px;
  margin: 0;
  font-size: 0.95em;
  line-height: 1.6;
  white-space: pre-wrap;
  word-break: break-word;
}

/* Roles (Misskey-style, border-based) */
.roles {
  padding: 12px 24px 0 154px;
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  font-size: 0.85em;
}

.role {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 3px 8px;
  border: solid 1px var(--nd-divider);
  border-radius: 999px;
}

/* Stats */
.stats {
  display: flex;
  padding: 24px;
  border-top: solid 0.5px var(--nd-divider);
  margin-top: 16px;
}

.stat {
  flex: 1;
  text-align: center;
}

.stat > b {
  display: block;
  line-height: 16px;
  font-size: 1.1em;
  color: var(--nd-fgHighlighted);
}

.stat > span {
  font-size: 70%;
  opacity: 0.6;
}

.stat-link {
  cursor: pointer;
  border-radius: 6px;
  padding: 4px;
}

.stat-link:hover {
  background: var(--nd-panelHighlight, rgba(255, 255, 255, 0.03));
}

/* Pinned notes section */
.pinned-section {
  border-top: solid 0.5px var(--nd-divider);
}

.pinned-header {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 10px 24px;
  font-size: 0.85em;
  font-weight: bold;
  color: var(--nd-fg);
  opacity: 0.7;
}

.pinned-header .ti {
  font-size: 1em;
}

/* Notes section */
.notes-section {
  border-top: solid 0.5px var(--nd-divider);
}

.notes-tab {
  padding: 14px 24px;
  font-size: 0.85em;
  font-weight: bold;
  color: var(--nd-accent);
  border-bottom: 2px solid var(--nd-accent);
  display: inline-block;
}

.state-message {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 2rem;
  color: var(--nd-fg);
  opacity: 0.6;
  font-size: 0.9em;
}

.state-error {
  color: var(--nd-love);
  opacity: 1;
}

/* Badges */
.badge {
  font-size: 0.75em;
  padding: 2px 8px;
  border-radius: 999px;
  background: var(--nd-buttonBg);
  color: var(--nd-fg);
}

.badge-cat {
  background: var(--nd-accentedBg);
  color: var(--nd-accent);
}

.role-icon {
  width: 1.3em;
  height: 1.3em;
  object-fit: contain;
}

/* Profile fields (key-value list) */
.profile-fields {
  padding: 16px 24px 0 154px;
}

.profile-field {
  display: flex;
  border-bottom: solid 0.5px var(--nd-divider);
  padding: 10px 0;
}

.profile-field:last-child {
  border-bottom: none;
}

.profile-field-name {
  flex: 0 0 120px;
  font-size: 0.85em;
  font-weight: bold;
  color: var(--nd-fgHighlighted);
  word-break: break-word;
}

.profile-field-value {
  flex: 1;
  font-size: 0.85em;
  word-break: break-word;
  min-width: 0;
}

/* Profile info (birthday, location, url) */
.profile-info {
  padding: 8px 24px 0 154px;
  display: flex;
  flex-wrap: wrap;
  gap: 4px 16px;
}

.profile-info-item {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 0.8em;
  opacity: 0.6;
}

.profile-info-item i {
  font-size: 1em;
}

.profile-info-link {
  color: var(--nd-accent);
  text-decoration: none;
}

.profile-info-link:hover {
  text-decoration: underline;
}

/* Mobile responsive via container query */
@container (max-width: 500px) {
  .banner-area {
    --bannerHeight: 140px;
  }

  .banner-fade {
    display: none;
  }

  .banner-title {
    display: none;
  }

  .user-avatar {
    top: 90px;
    left: 0;
    right: 0;
    width: 92px;
    height: 92px;
    margin: auto;
  }

  .mobile-title {
    display: block;
    text-align: center;
    padding: 50px 8px 16px 8px;
    border-bottom: solid 0.5px var(--nd-divider);
  }

  .mobile-name {
    font-weight: bold;
    font-size: 1.3em;
    color: var(--nd-fgHighlighted);
  }

  .mobile-username {
    font-size: 0.85em;
    opacity: 0.6;
    margin-top: 2px;
  }

  .mobile-badges {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
    justify-content: center;
    margin-top: 8px;
  }

  .roles {
    padding: 12px 16px 0;
    justify-content: center;
  }

  .banner-actions {
    top: 8px;
    right: 8px;
    padding: 6px;
  }

  .description {
    padding: 16px;
    text-align: center;
  }

  .profile-fields {
    padding: 16px;
  }

  .profile-field {
    flex-direction: column;
    gap: 2px;
  }

  .profile-field-name {
    flex: none;
  }

  .profile-info {
    padding: 8px 16px 0;
    justify-content: center;
  }

  .stats {
    padding: 16px;
  }
}
</style>
