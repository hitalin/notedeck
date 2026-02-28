<script setup lang="ts">
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
    notes.value = await adapter.api.getUserNotes(props.userId, { limit: 20 })
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
  <div class="user-profile-page" @scroll="onScroll">
    <header class="profile-header">
      <router-link to="/" class="back-btn _button">
        <svg viewBox="0 0 24 24" width="20" height="20">
          <path
            d="M15 18l-6-6 6-6"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
            fill="none"
          />
        </svg>
      </router-link>
      <h1 v-if="user" class="profile-title">
        <MkMfm v-if="user.name" :text="user.name" :server-host="account?.host" />
        <template v-else>{{ user.username }}</template>
      </h1>
      <h1 v-else class="profile-title">Profile</h1>
    </header>

    <div v-if="isLoading" class="state-message">Loading...</div>

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
          <div v-if="user.isFollowed" class="followed-badge">Follows you</div>

          <!-- Name overlay on banner (desktop) -->
          <div class="banner-title">
            <div class="banner-name">
              <MkMfm v-if="user.name" :text="user.name" :server-host="account?.host" />
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
        </div>

        <!-- Mobile title (shown below avatar on narrow screens) -->
        <div class="mobile-title">
          <div class="mobile-name">
            <MkMfm v-if="user.name" :text="user.name" :server-host="account?.host" />
            <template v-else>{{ user.username }}</template>
          </div>
          <div class="mobile-username">@{{ user.username }}{{ user.host ? `@${user.host}` : '' }}</div>
          <div v-if="user.isBot || user.isCat" class="mobile-badges">
            <span v-if="user.isBot" class="badge">Bot</span>
            <span v-if="user.isCat" class="badge badge-cat">Cat</span>
          </div>
        </div>

        <!-- Description -->
        <div v-if="user.description" class="description">
          <MkMfm :text="user.description" :server-host="account?.host" />
        </div>

        <div v-if="user.createdAt" class="joined">
          Joined {{ formatDate(user.createdAt) }}
        </div>

        <!-- Follow button -->
        <div v-if="!isOwnProfile" class="follow-area">
          <button
            class="follow-btn _button"
            :class="{ following: user.isFollowing }"
            :disabled="isFollowLoading"
            @click="handleToggleFollow"
          >
            {{ user.isFollowing ? 'Following' : 'Follow' }}
          </button>
        </div>

        <!-- Stats -->
        <div class="stats">
          <div class="stat">
            <b>{{ formatCount(user.notesCount) }}</b>
            <span>Notes</span>
          </div>
          <div class="stat">
            <b>{{ formatCount(user.followingCount) }}</b>
            <span>Following</span>
          </div>
          <div class="stat">
            <b>{{ formatCount(user.followersCount) }}</b>
            <span>Followers</span>
          </div>
        </div>

        <!-- User's notes -->
        <div class="notes-section">
          <div class="notes-tab">Notes</div>

          <MkNote
            v-for="note in notes"
            :key="note.id"
            :note="note"
            @react="handleReaction"
            @reply="handleReply"
            @renote="handleRenote"
            @quote="handleQuote"
            @delete="handleDelete"
            @edit="handleEdit"
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
.user-profile-page {
  height: 100vh;
  overflow-y: auto;
  background: var(--nd-bg);
}

.profile-header {
  display: flex;
  align-items: center;
  gap: 8px;
  height: 50px;
  padding: 0 16px;
  border-bottom: 1px solid var(--nd-divider);
  position: sticky;
  top: 0;
  background: var(--nd-windowHeader);
  backdrop-filter: blur(15px);
  z-index: 10;
}

.back-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border-radius: 6px;
  color: var(--nd-fg);
  text-decoration: none;
  transition: background 0.15s;
}

.back-btn:hover {
  background: var(--nd-buttonHoverBg);
  text-decoration: none;
}

.profile-title {
  font-size: 0.9em;
  font-weight: bold;
  margin: 0;
  color: var(--nd-fgHighlighted);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
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

/* Joined */
.joined {
  padding: 8px 24px 0 154px;
  font-size: 0.8em;
  opacity: 0.5;
}

/* Follow button */
.follow-area {
  padding: 16px 24px 0 154px;
}

.follow-btn {
  padding: 8px 24px;
  border-radius: 999px;
  font-size: 0.85em;
  font-weight: bold;
  color: #fff;
  background: var(--nd-accent);
  transition: opacity 0.15s;
}

.follow-btn:hover {
  opacity: 0.85;
}

.follow-btn:disabled {
  opacity: 0.5;
}

.follow-btn.following {
  background: var(--nd-buttonBg);
  color: var(--nd-fg);
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
    gap: 4px;
    justify-content: center;
    margin-top: 8px;
  }

  .follow-area {
    padding: 16px;
    text-align: center;
  }

  .description {
    padding: 16px;
    text-align: center;
  }

  .joined {
    padding: 0 16px;
    text-align: center;
  }

  .stats {
    padding: 16px;
  }
}
</style>
