<script setup lang="ts">
import { openUrl } from '@tauri-apps/plugin-opener'
import QRCodeStyling from 'qr-code-styling'
import tinycolor from 'tinycolor2'
import { computed, nextTick, onMounted, ref, shallowRef, watch } from 'vue'
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
import {
  displayUrl,
  formatBirthday,
  formatCount,
  formatDate,
} from '@/utils/format'
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

type ProfileTab = 'highlight' | 'notes' | 'all' | 'files'
const PROFILE_TABS: { key: ProfileTab; label: string; icon: string }[] = [
  { key: 'highlight', label: 'ハイライト', icon: 'ti ti-bolt' },
  { key: 'notes', label: 'ノート', icon: 'ti ti-pencil' },
  { key: 'all', label: '全て', icon: 'ti ti-notebook' },
  { key: 'files', label: 'ファイル付き', icon: 'ti ti-photo' },
]

const user = ref<NormalizedUserDetail | null>(null)
const MAX_PROFILE_NOTES = 500
const activeTab = ref<ProfileTab>('highlight')
const notes = shallowRef<NormalizedNote[]>([])
const pinnedNotes = shallowRef<NormalizedNote[]>([])
const pinnedNoteIds = ref<string[]>([])
const isLoading = ref(true)
const isLoadingNotes = ref(false)
const hasMoreNotes = ref(true)
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
    const [userDetail, userPinnedNoteIds] = await Promise.all([
      adapter.api.getUserDetail(props.userId),
      adapter.api.getUserPinnedNoteIds(props.userId),
    ])
    user.value = userDetail
    pinnedNoteIds.value = userPinnedNoteIds
    if (userPinnedNoteIds.length > 0) {
      const pinned = await Promise.all(
        userPinnedNoteIds.map((id) => adapter?.api.getNote(id)),
      )
      pinnedNotes.value = pinned.filter((n): n is NormalizedNote => n != null)
    }
    await loadTabNotes()
  } catch (e) {
    error.value = AppError.from(e)
  } finally {
    isLoading.value = false
  }
})

async function fetchNotes(untilId?: string): Promise<NormalizedNote[]> {
  if (!adapter) return []
  const tab = activeTab.value
  if (tab === 'highlight') {
    return adapter.api.getUserFeaturedNotes(props.userId, {
      limit: 30,
      untilId,
    })
  }
  if (tab === 'all') {
    return adapter.api.getUserNotes(props.userId, {
      limit: 20,
      untilId,
      withReplies: true,
      withChannelNotes: true,
    })
  }
  if (tab === 'files') {
    return adapter.api.getUserNotes(props.userId, {
      limit: 20,
      untilId,
      withFiles: true,
    })
  }
  return adapter.api.getUserNotes(props.userId, { limit: 20, untilId })
}

async function loadTabNotes() {
  isLoadingNotes.value = true
  hasMoreNotes.value = true
  notes.value = []
  try {
    const fetched = await fetchNotes()
    notes.value = fetched
    if (fetched.length === 0 || activeTab.value === 'highlight') {
      hasMoreNotes.value = false
    }
  } catch (e) {
    error.value = AppError.from(e)
  } finally {
    isLoadingNotes.value = false
  }
}

async function loadMoreNotes() {
  if (!adapter || isLoadingNotes.value || !hasMoreNotes.value) return
  if (notes.value.length >= MAX_PROFILE_NOTES) return
  const last = notes.value.at(-1)
  if (!last) return
  isLoadingNotes.value = true
  try {
    const older = await fetchNotes(last.id)
    if (older.length === 0) {
      hasMoreNotes.value = false
    } else {
      notes.value = [...notes.value, ...older]
    }
  } catch (e) {
    error.value = AppError.from(e)
  } finally {
    isLoadingNotes.value = false
  }
}

watch(activeTab, () => {
  loadTabNotes()
})

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

// Post form state
const showPostForm = ref(false)
const postFormReplyTo = ref<NormalizedNote | undefined>()
const postFormRenoteId = ref<string | undefined>()
const postFormEditNote = ref<NormalizedNote | undefined>()

const isFollowLoading = ref(false)
const showQrCode = ref(false)
const qrCodeContainerEl = ref<HTMLDivElement | null>(null)

async function openQrCode() {
  if (!user.value || !account.value) return
  showQrCode.value = true
  await nextTick()

  const container = qrCodeContainerEl.value
  if (!container) return
  container.innerHTML = ''

  const username = user.value.username
  const host = user.value.host || ''
  const profileUrl = `https://${account.value.host}/@${username}${host ? `@${host}` : ''}`

  const themeColor = user.value.instance?.themeColor
  const baseColor = tinycolor(themeColor || '#86b300')
  const hsl = baseColor.toHsl()

  const serverInfo = serversStore.getServer(account.value.host)

  const qr = new QRCodeStyling({
    width: 600,
    height: 600,
    margin: 42,
    type: 'canvas',
    data: profileUrl,
    image: serverInfo?.iconUrl || undefined,
    qrOptions: {
      typeNumber: 0,
      mode: 'Byte',
      errorCorrectionLevel: 'H',
    },
    imageOptions: {
      hideBackgroundDots: true,
      imageSize: 0.3,
      margin: 16,
      crossOrigin: 'anonymous',
    },
    dotsOptions: {
      type: 'dots',
      color: tinycolor({ h: hsl.h, s: 1, l: 0.18 }).toRgbString(),
    },
    cornersDotOptions: {
      type: 'dot',
    },
    cornersSquareOptions: {
      type: 'extra-rounded',
    },
    backgroundOptions: {
      color: tinycolor({ h: hsl.h, s: 1, l: 0.97 }).toRgbString(),
    },
  })

  qr.append(container)
}

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
            <button class="_button banner-action-btn" title="QRコード" @click="openQrCode">
              <i class="ti ti-qrcode" />
            </button>
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

        <!-- Notes tabs -->
        <div class="notes-section">
          <div class="notes-tabs">
            <button
              v-for="tab in PROFILE_TABS"
              :key="tab.key"
              class="notes-tab-item _button"
              :class="{ active: activeTab === tab.key }"
              @click="activeTab = tab.key"
            >
              <i :class="tab.icon" />
              {{ tab.label }}
            </button>
          </div>

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
            読み込み中...
          </div>

          <div v-if="!isLoadingNotes && notes.length === 0" class="state-message">
            ノートはありません
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

      <div v-if="showQrCode" class="qr-overlay" @click="showQrCode = false">
        <div class="qr-modal" @click.stop>
          <button class="_button qr-close-btn" @click="showQrCode = false">
            <i class="ti ti-x" />
          </button>
          <div ref="qrCodeContainerEl" class="qr-canvas" />
          <div class="qr-user">
            <img v-if="user?.avatarUrl" :src="user.avatarUrl" class="qr-avatar" />
            <div class="qr-user-info">
              <div class="qr-name">
                <MkMfm v-if="user?.name" :text="user.name" :emojis="user?.emojis" :server-host="account?.host" />
                <template v-else>{{ user?.username }}</template>
              </div>
              <div class="qr-acct">@{{ user?.username }}@{{ account?.host }}</div>
            </div>
          </div>
        </div>
      </div>
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
  width: 44px;
  height: 44px;
  color: #fff;
  text-shadow: 0 0 8px #000;
  font-size: 16px;
}

.banner-follow-btn {
  padding: 8px 16px;
  min-height: 44px;
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

.notes-tabs {
  display: flex;
  border-bottom: solid 0.5px var(--nd-divider);
  position: sticky;
  top: 0;
  background: var(--nd-bg);
  z-index: 5;
}

.notes-tab-item {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 14px 8px;
  font-size: 0.85em;
  font-weight: bold;
  color: var(--nd-fg);
  opacity: 0.6;
  border-bottom: 2px solid transparent;
  transition: opacity 0.15s, border-color 0.15s;
}

.notes-tab-item:hover {
  opacity: 0.8;
}

.notes-tab-item.active {
  color: var(--nd-accent);
  opacity: 1;
  border-bottom-color: var(--nd-accent);
}

.notes-tab-item i {
  font-size: 1em;
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

/* QR code modal */
.qr-overlay {
  position: fixed;
  inset: 0;
  z-index: 10000;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.6);
  backdrop-filter: blur(4px);
}

.qr-modal {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
}

.qr-close-btn {
  position: absolute;
  top: -40px;
  right: -40px;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  border-radius: 50%;
  color: #fff;
  background: rgba(255, 255, 255, 0.15);
  font-size: 16px;
}

.qr-close-btn:hover {
  background: rgba(255, 255, 255, 0.3);
}

.qr-canvas {
  width: 230px;
  aspect-ratio: 1;
  border-radius: 12px;
  overflow: hidden;
}

.qr-canvas :deep(canvas) {
  width: 100% !important;
  height: 100% !important;
}

.qr-user {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  margin-top: 28px;
  color: #fff;
  max-width: 230px;
}

.qr-avatar {
  width: 58px;
  height: 58px;
  border-radius: 50%;
  object-fit: cover;
  margin-bottom: 16px;
}

.qr-user-info {
  overflow: hidden;
  max-width: 100%;
}

.qr-name {
  font-weight: bold;
  font-size: 1.1em;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.qr-acct {
  font-size: 0.9em;
  opacity: 0.7;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
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

  .notes-tab-item {
    min-height: 44px;
  }
}
</style>
