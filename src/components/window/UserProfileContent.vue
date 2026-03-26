<script setup lang="ts">
import {
  computed,
  defineAsyncComponent,
  nextTick,
  onMounted,
  ref,
  shallowRef,
  watch,
} from 'vue'
import { initAdapterFor } from '@/adapters/initAdapter'
import type {
  NormalizedNote,
  NormalizedUserDetail,
  ServerAdapter,
  UserList,
} from '@/adapters/types'
import MkAvatar from '@/components/common/MkAvatar.vue'
import MkMfm from '@/components/common/MkMfm.vue'
import MkNote from '@/components/common/MkNote.vue'
import PopupMenu from '@/components/common/PopupMenu.vue'

const MkPostForm = defineAsyncComponent(
  () => import('@/components/common/MkPostForm.vue'),
)

import { useNavigation } from '@/composables/useNavigation'
import { useAccountsStore } from '@/stores/accounts'
import { useServersStore } from '@/stores/servers'
import { useToast } from '@/stores/toast'
import { useWindowsStore } from '@/stores/windows'
import { AppError } from '@/utils/errors'
import {
  displayUrl,
  formatBirthday,
  formatCount,
  formatDate,
} from '@/utils/format'
import { proxyUrl } from '@/utils/imageProxy'
import { invoke } from '@/utils/tauriInvoke'
import { toggleFollow } from '@/utils/toggleFollow'
import { toggleReaction } from '@/utils/toggleReaction'
import { safeCssUrl } from '@/utils/url'

const openUrl = async (url: string) => {
  const { openUrl: open } = await import('@tauri-apps/plugin-opener')
  return open(url)
}

const props = defineProps<{
  accountId: string
  userId: string
}>()

const { navigateToUser: navToUser } = useNavigation()
const accountsStore = useAccountsStore()
const serversStore = useServersStore()
const toast = useToast()

type ProfileTab = 'highlight' | 'notes' | 'all' | 'files'
const PROFILE_TABS: { key: ProfileTab; label: string; icon: string }[] = [
  { key: 'highlight', label: 'ハイライト', icon: 'ti ti-bolt' },
  { key: 'notes', label: 'ノート', icon: 'ti ti-pencil' },
  { key: 'all', label: '全て', icon: 'ti ti-notebook' },
  { key: 'files', label: 'ファイル付き', icon: 'ti ti-photo' },
]

const user = ref<NormalizedUserDetail | null>(null)
const canSeeFollowing = computed(() => {
  if (isOwnProfile.value) return true
  const v = user.value?.followingVisibility ?? 'public'
  if (v === 'public') return true
  if (v === 'followers' && user.value?.isFollowed) return true
  return false
})
const canSeeFollowers = computed(() => {
  if (isOwnProfile.value) return true
  const v = user.value?.followersVisibility ?? 'public'
  if (v === 'public') return true
  if (v === 'followers' && user.value?.isFollowed) return true
  return false
})
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
    const result = await initAdapterFor(account.host, account.id, {
      pinnedReactions: false,
      hasToken: account.hasToken,
    })
    adapter = result.adapter
    const userDetail = await adapter.api.getUserDetail(props.userId)
    user.value = userDetail

    // Prefetch banner image so it appears instantly when DOM renders
    if (userDetail.bannerUrl) {
      new Image().src = userDetail.bannerUrl
    }

    // Pinned notes require auth — skip for logged-out/guest accounts
    if (account.hasToken) {
      const userPinnedNoteIds = await adapter.api.getUserPinnedNoteIds(
        props.userId,
      )
      pinnedNoteIds.value = userPinnedNoteIds
      if (userPinnedNoteIds.length > 0) {
        const pinned = await Promise.all(
          userPinnedNoteIds.map((id) => adapter?.api.getNote(id)),
        )
        pinnedNotes.value = pinned.filter((n): n is NormalizedNote => n != null)
      }
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

async function fetchImageAsDataUrl(url: string): Promise<string | undefined> {
  try {
    return (
      (await invoke<string | null>('fetch_image_base64', { url })) ?? undefined
    )
  } catch {
    return undefined
  }
}

async function openQrCode() {
  if (!user.value || !account.value) return
  showQrCode.value = true
  await nextTick()

  const container = qrCodeContainerEl.value
  if (!container) return
  container.replaceChildren()

  const profileUrl = `https://${account.value.host}/users/${user.value.id}`

  const serverInfo = await serversStore.getServerInfo(account.value.host)

  const { colord } = await import('colord')
  const baseColor = colord(serverInfo.themeColor || '#86b300')
  const hsl = baseColor.toHsl()

  const imageDataUrl = serverInfo.iconUrl
    ? await fetchImageAsDataUrl(serverInfo.iconUrl)
    : undefined

  const { default: QRCodeStyling } = await import('qr-code-styling')
  const qr = new QRCodeStyling({
    width: 600,
    height: 600,
    margin: 42,
    type: 'canvas',
    data: profileUrl,
    image: imageDataUrl,
    qrOptions: {
      typeNumber: 0,
      mode: 'Byte',
      errorCorrectionLevel: 'H',
    },
    imageOptions: {
      hideBackgroundDots: true,
      imageSize: 0.3,
      margin: 16,
    },
    dotsOptions: {
      type: 'dots',
      color: colord({ h: hsl.h, s: 100, l: 18 }).toRgbString(),
    },
    cornersDotOptions: {
      type: 'dot',
    },
    cornersSquareOptions: {
      type: 'extra-rounded',
    },
    backgroundOptions: {
      color: colord({ h: hsl.h, s: 100, l: 97 }).toRgbString(),
    },
  })

  qr.append(container)

  const canvas = container.querySelector('canvas')
  if (canvas) {
    Object.assign(canvas.style, {
      position: 'absolute',
      top: '0',
      left: '0',
      width: '100%',
      height: '100%',
    })
  }
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

// User action menu state
const userMenuRef = ref<InstanceType<typeof PopupMenu>>()
const showMuteConfirm = ref(false)
const showBlockConfirm = ref(false)
const showReportForm = ref(false)
const showListPicker = ref(false)
const reportComment = ref('')
const userLists = ref<UserList[]>([])

type UserMenuView =
  | 'main'
  | 'muteConfirm'
  | 'blockConfirm'
  | 'reportForm'
  | 'listPicker'
const userMenuView = computed<UserMenuView>(() => {
  if (showMuteConfirm.value) return 'muteConfirm'
  if (showBlockConfirm.value) return 'blockConfirm'
  if (showReportForm.value) return 'reportForm'
  if (showListPicker.value) return 'listPicker'
  return 'main'
})

function closeUserMenu() {
  userMenuRef.value?.close()
}

function userMenuBack() {
  showMuteConfirm.value = false
  showBlockConfirm.value = false
  showReportForm.value = false
  showListPicker.value = false
  reportComment.value = ''
}

async function handleMuteUser() {
  if (!adapter || !user.value) return
  try {
    await adapter.api.muteUser(user.value.id)
    toast.show('ミュートしました')
    closeUserMenu()
  } catch {
    toast.show('ミュートに失敗しました', 'error')
  }
}

async function handleBlockUser() {
  if (!adapter || !user.value) return
  try {
    await adapter.api.blockUser(user.value.id)
    toast.show('ブロックしました')
    closeUserMenu()
  } catch {
    toast.show('ブロックに失敗しました', 'error')
  }
}

async function handleReportUser() {
  if (!adapter || !user.value || !reportComment.value.trim()) return
  try {
    await adapter.api.reportUser(user.value.id, reportComment.value)
    toast.show('通報しました')
    closeUserMenu()
  } catch {
    toast.show('通報に失敗しました', 'error')
  }
}

async function openListPicker() {
  if (!adapter) return
  try {
    userLists.value = await adapter.api.getUserLists()
    showListPicker.value = true
  } catch {
    toast.show('リストの取得に失敗しました', 'error')
  }
}

async function addToList(listId: string) {
  if (!adapter || !user.value) return
  try {
    await adapter.api.addUserToList(listId, user.value.id)
    toast.show('リストに追加しました')
    closeUserMenu()
  } catch {
    toast.show('リストへの追加に失敗しました', 'error')
  }
}

const windowsStore = useWindowsStore()

function openFollowList(type: 'following' | 'followers') {
  if (!user.value) return
  windowsStore.open('follow-list', {
    accountId: props.accountId,
    userId: user.value.id,
    username: user.value.username,
    initialTab: type,
  })
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

async function handleDeleteAndEdit(target: NormalizedNote) {
  if (!adapter) return
  try {
    await adapter.api.deleteNote(target.id)
    const id = target.id
    notes.value = notes.value.filter((n) => n.id !== id && n.renoteId !== id)
    postFormReplyTo.value = target.replyId
      ? await adapter.api.getNote(target.replyId).catch(() => undefined)
      : undefined
    postFormRenoteId.value = undefined
    postFormEditNote.value = undefined
    showPostForm.value = true
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
  <div :class="$style.userProfileContent" @scroll.passive="onScroll">
    <div v-if="isLoading" :class="$style.stateMessage">読み込み中...</div>

    <div v-else-if="error" :class="[$style.stateMessage, $style.stateError]">
      <p>{{ error.message }}</p>
    </div>

    <template v-else-if="user">
      <div :class="$style.profileContainer">
        <!-- Banner area -->
        <div :class="$style.bannerArea">
          <div
            v-if="user.bannerUrl"
            :class="$style.banner"
            :style="{ backgroundImage: safeCssUrl(proxyUrl(user.bannerUrl)) }"
          />
          <div v-else :class="[$style.banner, $style.bannerEmpty]" />

          <!-- Gradient fade -->
          <div :class="$style.bannerFade" />

          <!-- "Follows you" badge on banner -->
          <div v-if="user.isFollowed" :class="$style.followedBadge">フォローされています</div>

          <!-- Name overlay on banner (desktop) -->
          <div :class="$style.bannerTitle">
            <div :class="$style.bannerName">
              <MkMfm v-if="user.name" :text="user.name" :emojis="user.emojis" :server-host="account?.host" />
              <template v-else>{{ user.username }}</template>
            </div>
            <div :class="$style.bannerBottom">
              <span :class="$style.bannerUsername">@{{ user.username }}{{ user.host ? `@${user.host}` : '' }}</span>
              <span v-if="user.isBot" :class="$style.bannerBadge">Bot</span>
              <span v-if="user.isCat" :class="$style.bannerBadge">Cat</span>
            </div>
          </div>

          <!-- Avatar -->
          <MkAvatar
            :avatar-url="user.avatarUrl"
            :decorations="user.avatarDecorations"
            :size="120"
            indicator
            :online-status="user.onlineStatus"
            :class="$style.userAvatar"
          />

          <!-- Banner actions -->
          <div :class="$style.bannerActions">
            <button class="_button" :class="$style.bannerActionBtn" title="QRコード" @click="openQrCode">
              <i class="ti ti-qrcode" />
            </button>
            <button class="_button" :class="$style.bannerActionBtn" :title="isOwnProfile ? 'プロフィールを編集' : 'Web UIで開く'" @click="openUrl(`https://${account?.host}/${isOwnProfile ? 'settings/profile' : `@${user.username}${user.host ? `@${user.host}` : ''}`}`)">
              <i :class="isOwnProfile ? 'ti ti-pencil' : 'ti ti-external-link'" />
            </button>
            <button
              v-if="!isOwnProfile"
              class="_button"
              :class="[$style.bannerFollowBtn, { [$style.following]: user.isFollowing }]"
              :disabled="isFollowLoading"
              @click="handleToggleFollow"
            >
              {{ user.isFollowing ? 'フォロー中' : 'フォロー' }}
            </button>
            <button
              v-if="!isOwnProfile"
              class="_button"
              :class="$style.bannerActionBtn"
              title="その他"
              @click="userMenuRef?.open($event)"
            >
              <i class="ti ti-dots" />
            </button>
          </div>
        </div>

        <!-- Mobile title (shown below avatar on narrow screens) -->
        <div :class="$style.mobileTitle">
          <div :class="$style.mobileName">
            <MkMfm v-if="user.name" :text="user.name" :emojis="user.emojis" :server-host="account?.host" />
            <template v-else>{{ user.username }}</template>
          </div>
          <div :class="$style.mobileUsername">@{{ user.username }}{{ user.host ? `@${user.host}` : '' }}</div>
          <div v-if="user.isBot || user.isCat" :class="$style.mobileBadges">
            <span v-if="user.isBot" :class="$style.badge">Bot</span>
            <span v-if="user.isCat" :class="[$style.badge, $style.badgeCat]">Cat</span>
          </div>
        </div>

        <!-- Roles -->
        <div v-if="user.roles?.length" :class="$style.roles">
          <span
            v-for="role in user.roles"
            :key="role.id"
            :class="$style.role"
            :style="role.color ? { borderColor: role.color } : {}"
          >
            <img v-if="role.iconUrl" :src="role.iconUrl" :class="$style.roleIcon" />
            {{ role.name }}
          </span>
        </div>

        <!-- Description -->
        <div v-if="user.description" :class="$style.description">
          <MkMfm :text="user.description" :emojis="user.emojis" :server-host="account?.host" />
        </div>

        <!-- Custom fields -->
        <div v-if="user.fields?.length" :class="$style.profileFields">
          <div v-for="(field, i) in user.fields" :key="i" :class="$style.profileField">
            <div :class="$style.profileFieldName">{{ field.name }}</div>
            <div :class="$style.profileFieldValue">
              <MkMfm :text="field.value" :emojis="user.emojis" :server-host="account?.host" />
            </div>
          </div>
        </div>

        <!-- Profile info (birthday, location, url, registration date) -->
        <div v-if="user.birthday || user.location || user.url || user.createdAt" :class="$style.profileInfo">
          <div v-if="user.birthday" :class="$style.profileInfoItem">
            <i class="ti ti-cake" />
            <span>{{ formatBirthday(user.birthday) }}</span>
          </div>
          <div v-if="user.location" :class="$style.profileInfoItem">
            <i class="ti ti-map-pin" />
            <span>{{ user.location }}</span>
          </div>
          <div v-if="user.url" :class="$style.profileInfoItem">
            <i class="ti ti-link" />
            <button class="_button" :class="$style.profileInfoLink" @click="openUrl(user.url!)">
              {{ displayUrl(user.url!) }}
            </button>
          </div>
          <div v-if="user.createdAt" :class="$style.profileInfoItem">
            <i class="ti ti-calendar" />
            <span>{{ formatDate(user.createdAt) }}</span>
          </div>
        </div>

        <!-- Stats -->
        <div :class="$style.stats">
          <div :class="$style.stat">
            <b>{{ formatCount(user.notesCount) }}</b>
            <span>ノート</span>
          </div>
          <button v-if="canSeeFollowing" :class="[$style.stat, $style.statLink]" class="_button" @click="openFollowList('following')">
            <b>{{ formatCount(user.followingCount) }}</b>
            <span>フォロー</span>
          </button>
          <button v-if="canSeeFollowers" :class="[$style.stat, $style.statLink]" class="_button" @click="openFollowList('followers')">
            <b>{{ formatCount(user.followersCount) }}</b>
            <span>フォロワー</span>
          </button>
        </div>

        <!-- Pinned notes -->
        <div v-if="pinnedNotes.length > 0" :class="$style.pinnedSection">
          <div :class="$style.pinnedHeader">
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
            @delete-and-edit="handleDeleteAndEdit"
            @pin="handlePin"
          />
        </div>

        <!-- Notes tabs -->
        <div :class="$style.notesSection">
          <div :class="$style.notesTabs">
            <button
              v-for="tab in PROFILE_TABS"
              :key="tab.key"
              class="_button"
              :class="[$style.notesTabItem, { [$style.active]: activeTab === tab.key }]"
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
            @delete-and-edit="handleDeleteAndEdit"
            @pin="handlePin"
          />

          <div v-if="isLoadingNotes" :class="$style.stateMessage">
            読み込み中...
          </div>

          <div v-if="!isLoadingNotes && notes.length === 0" :class="$style.stateMessage">
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

      <!-- User action menu -->
      <PopupMenu ref="userMenuRef" @close="userMenuBack">
        <!-- Main -->
        <template v-if="userMenuView === 'main'">
          <button class="_popupItem" @click="openListPicker">
            <i class="ti ti-list" />
            リストに追加
          </button>
          <div class="_popupDivider" />
          <button class="_popupItem" @click="showMuteConfirm = true">
            <i class="ti ti-eye-off" />
            ミュート
          </button>
          <button class="_popupItem _popupItemDanger" @click="showBlockConfirm = true">
            <i class="ti ti-ban" />
            ブロック
          </button>
          <div class="_popupDivider" />
          <button class="_popupItem _popupItemDanger" @click="showReportForm = true">
            <i class="ti ti-alert-triangle" />
            通報
          </button>
        </template>
        <!-- Mute confirm -->
        <template v-else-if="userMenuView === 'muteConfirm'">
          <div class="_popupConfirmText">@{{ user?.username }} をミュートしますか？</div>
          <button class="_popupItem _popupItemDanger" @click="handleMuteUser">
            <i class="ti ti-eye-off" />
            ミュート
          </button>
          <button class="_popupItem" @click="userMenuBack">
            <i class="ti ti-x" />
            キャンセル
          </button>
        </template>
        <!-- Block confirm -->
        <template v-else-if="userMenuView === 'blockConfirm'">
          <div class="_popupConfirmText">@{{ user?.username }} をブロックしますか？</div>
          <button class="_popupItem _popupItemDanger" @click="handleBlockUser">
            <i class="ti ti-ban" />
            ブロック
          </button>
          <button class="_popupItem" @click="userMenuBack">
            <i class="ti ti-x" />
            キャンセル
          </button>
        </template>
        <!-- Report form -->
        <template v-else-if="userMenuView === 'reportForm'">
          <div class="_popupConfirmText">@{{ user?.username }} を通報</div>
          <div class="_popupReportInputWrap">
            <textarea
              v-model="reportComment"
              class="_popupReportInput"
              placeholder="通報理由を入力..."
              rows="3"
            />
          </div>
          <button
            class="_popupItem _popupItemDanger"
            :disabled="!reportComment.trim()"
            @click="handleReportUser"
          >
            <i class="ti ti-alert-triangle" />
            送信
          </button>
          <button class="_popupItem" @click="userMenuBack">
            <i class="ti ti-x" />
            キャンセル
          </button>
        </template>
        <!-- List picker -->
        <template v-else-if="userMenuView === 'listPicker'">
          <button class="_popupItem" @click="userMenuBack">
            <i class="ti ti-arrow-left" />
            戻る
          </button>
          <div class="_popupDivider" />
          <template v-if="userLists.length > 0">
            <button
              v-for="list in userLists"
              :key="list.id"
              class="_popupItem"
              @click="addToList(list.id)"
            >
              <i class="ti ti-list" />
              {{ list.name }}
            </button>
          </template>
          <div v-else class="_popupConfirmText">リストがありません</div>
        </template>
      </PopupMenu>

      <div v-if="showQrCode" :class="$style.qrOverlay" @click="showQrCode = false">
        <div :class="$style.qrModal" @click.stop>
          <button class="_button" :class="$style.qrCloseBtn" @click="showQrCode = false">
            <i class="ti ti-x" />
          </button>
          <div ref="qrCodeContainerEl" :class="$style.qrCanvas" />
          <div :class="$style.qrUser">
            <img v-if="user?.avatarUrl" :src="proxyUrl(user.avatarUrl)" :class="$style.qrAvatar" />
            <div :class="$style.qrUserInfo">
              <div :class="$style.qrName">
                <MkMfm v-if="user?.name" :text="user.name" :emojis="user?.emojis" :server-host="account?.host" />
                <template v-else>{{ user?.username }}</template>
              </div>
              <div :class="$style.qrAcct">@{{ user?.username }}@{{ account?.host }}</div>
            </div>
          </div>
          <img :class="$style.qrLogo" src="/misskey-logo.svg" alt="Misskey" />
        </div>
      </div>
    </Teleport>
  </div>
</template>

<style lang="scss" module>
.userProfileContent {
  height: 100%;
  overflow-y: auto;
  background: var(--nd-bg);
}

.profileContainer {
  max-width: 800px;
  margin: 0 auto;
  container-type: inline-size;
}

.bannerArea {
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

.bannerEmpty {
  background: linear-gradient(135deg, color-mix(in srgb, var(--nd-accent) 40%, var(--nd-panel)), color-mix(in srgb, var(--nd-accent) 20%, var(--nd-panel)));
}

.bannerFade {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  height: 78px;
  background: linear-gradient(transparent, rgba(0, 0, 0, 0.7));
  pointer-events: none;
}

.followedBadge {
  position: absolute;
  top: 12px;
  left: 12px;
  padding: 4px 12px;
  border-radius: var(--nd-radius-full);
  font-size: 0.75em;
  font-weight: bold;
  color: #fff;
  background: rgba(0, 0, 0, 0.35);
  backdrop-filter: blur(var(--nd-blur-panel));
  -webkit-backdrop-filter: blur(var(--nd-blur-panel));
}

.bannerTitle {
  position: absolute;
  bottom: 0;
  left: 0;
  width: 100%;
  padding: 0 0 8px 154px;
  color: #fff;
  pointer-events: none;
}

.bannerName {
  line-height: 32px;
  font-weight: bold;
  font-size: 1.8em;
  filter: drop-shadow(0 0 4px #000);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.bannerBottom {
  line-height: 20px;
  opacity: 0.8;
  filter: drop-shadow(0 0 4px #000);
}

.bannerUsername {
  font-weight: bold;
  margin-right: 16px;
}

.bannerBadge {
  display: inline-block;
  margin-right: 8px;
  padding: 1px 8px;
  border-radius: var(--nd-radius-full);
  font-size: 0.8em;
  background: rgba(255, 255, 255, 0.2);
}

.bannerActions {
  position: absolute;
  top: 12px;
  right: 12px;
  display: flex;
  align-items: center;
  gap: 4px;
  background: rgba(0, 0, 0, 0.2);
  backdrop-filter: blur(var(--nd-blur-panel));
  -webkit-backdrop-filter: blur(var(--nd-blur-panel));
  padding: 8px;
  border-radius: 24px;
  z-index: 3;
}

.bannerActionBtn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 31px;
  height: 31px;
  color: #fff;
  text-shadow: 0 0 8px #000;
  font-size: 16px;
}

.bannerFollowBtn {
  padding: 0 8px 0 12px;
  height: 31px;
  border-radius: 32px;
  font-size: 14px;
  font-weight: bold;
  color: #fff;
  background: var(--nd-accent);
  margin-left: 4px;

  &:hover {
    opacity: 0.85;
  }

  &:disabled {
    opacity: 0.5;
  }

  &.following {
    background: var(--nd-accent);
    color: #fff;
  }
}

.userAvatar {
  position: absolute;
  top: 170px;
  left: 16px;
  z-index: 2;
}

.mobileTitle {
  display: none;
}

.description {
  padding: 24px 24px 0 154px;
  margin: 0;
  font-size: 0.95em;
  line-height: 1.6;
  white-space: pre-wrap;
  word-break: break-word;
}

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
  border-radius: var(--nd-radius-full);
}

.stats {
  display: flex;
  padding: 24px;
  border-top: solid 0.5px var(--nd-divider);
  margin-top: 16px;
}

.stat {
  flex: 1;
  text-align: center;

  > b {
    display: block;
    line-height: 16px;
    font-size: 1.1em;
    color: var(--nd-fgHighlighted);
  }

  > span {
    font-size: 70%;
    opacity: 0.6;
  }
}

.statLink {
  cursor: pointer;
  border-radius: var(--nd-radius-sm);
  padding: 4px;

  &:hover {
    background: var(--nd-panelHighlight, rgba(255, 255, 255, 0.03));
  }
}

.pinnedSection {
  border-top: solid 0.5px var(--nd-divider);
}

.pinnedHeader {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 10px 24px;
  font-size: 0.85em;
  font-weight: bold;
  color: var(--nd-fg);
  opacity: 0.7;

  .ti {
    font-size: 1em;
  }
}

.notesSection {
  border-top: solid 0.5px var(--nd-divider);
}

.notesTabs {
  display: flex;
  border-bottom: solid 0.5px var(--nd-divider);
  position: sticky;
  top: 0;
  background: var(--nd-bg);
  z-index: 5;
}

.notesTabItem {
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
  transition: opacity var(--nd-duration-base), border-color var(--nd-duration-base);

  &:hover {
    opacity: 0.8;
  }

  &.active {
    color: var(--nd-accent);
    opacity: 1;
    border-bottom-color: var(--nd-accent);
  }

  i {
    font-size: 1em;
  }
}

.stateMessage {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 2rem;
  color: var(--nd-fg);
  opacity: 0.6;
  font-size: 0.9em;
}

.stateError {
  color: var(--nd-love);
  opacity: 1;
}

.badge {
  font-size: 0.75em;
  padding: 2px 8px;
  border-radius: var(--nd-radius-full);
  background: var(--nd-buttonBg);
  color: var(--nd-fg);
}

.badgeCat {
  background: var(--nd-accentedBg);
  color: var(--nd-accent);
}

.roleIcon {
  width: 1.3em;
  height: 1.3em;
  object-fit: contain;
}

.profileFields {
  padding: 16px 24px 0 154px;
}

.profileField {
  display: flex;
  border-bottom: solid 0.5px var(--nd-divider);
  padding: 10px 0;

  &:last-child {
    border-bottom: none;
  }
}

.profileFieldName {
  flex: 0 0 120px;
  font-size: 0.85em;
  font-weight: bold;
  color: var(--nd-fgHighlighted);
  word-break: break-word;
}

.profileFieldValue {
  flex: 1;
  font-size: 0.85em;
  word-break: break-word;
  min-width: 0;
}

.profileInfo {
  padding: 8px 24px 0 154px;
  display: flex;
  flex-wrap: wrap;
  gap: 4px 16px;
}

.profileInfoItem {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 0.8em;
  opacity: 0.6;

  i {
    font-size: 1em;
  }
}

.profileInfoLink {
  color: var(--nd-accent);
  text-decoration: none;

  &:hover {
    text-decoration: underline;
  }
}

.qrOverlay {
  position: fixed;
  inset: 0;
  z-index: var(--nd-z-popup);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  background: var(--nd-overlayDark);
  backdrop-filter: blur(var(--nd-blur-content));
  -webkit-backdrop-filter: blur(var(--nd-blur-content));
}

.qrModal {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
}

.qrCloseBtn {
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

  &:hover {
    background: rgba(255, 255, 255, 0.3);
  }
}

.qrCanvas {
  position: relative;
  width: min(230px, 80vw);
  border-radius: 12px;
  overflow: clip;
  aspect-ratio: 1;
}

.qrUser {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  margin-top: 28px;
  color: #fff;
  max-width: 230px;
}

.qrAvatar {
  width: 58px;
  height: 58px;
  border-radius: 50%;
  object-fit: cover;
  margin-bottom: 16px;
}

.qrUserInfo {
  overflow: hidden;
  max-width: 100%;
}

.qrName {
  font-weight: bold;
  font-size: 1.1em;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.qrAcct {
  font-size: 0.9em;
  opacity: 0.7;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.qrLogo {
  width: 100px;
  margin-top: 28px;
  filter: drop-shadow(0 0 6px rgb(0 0 0 / 43%));
}

.mobileName {}
.mobileUsername {}
.mobileBadges {}

@container (max-width: 500px) {
  .bannerArea {
    --bannerHeight: 140px;
  }

  .bannerFade {
    display: none;
  }

  .bannerTitle {
    display: none;
  }

  .userAvatar {
    top: 90px;
    left: 0;
    right: 0;
    width: 92px !important;
    height: 92px !important;
    margin: auto;
  }

  .mobileTitle {
    display: block;
    text-align: center;
    padding: 50px 8px 16px 8px;
    border-bottom: solid 0.5px var(--nd-divider);
  }

  .mobileName {
    font-weight: bold;
    font-size: 1.3em;
    color: var(--nd-fgHighlighted);
  }

  .mobileUsername {
    font-size: 0.85em;
    opacity: 0.6;
    margin-top: 2px;
  }

  .mobileBadges {
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

  .bannerActions {
    top: 8px;
    right: 8px;
    padding: 6px;
  }

  .description {
    padding: 16px;
    text-align: center;
  }

  .profileFields {
    padding: 16px;
  }

  .profileField {
    flex-direction: column;
    gap: 2px;
  }

  .profileFieldName {
    flex: none;
  }

  .profileInfo {
    padding: 8px 16px 0;
    justify-content: center;
  }

  .stats {
    padding: 16px;
  }

  .notesTabItem {
    min-height: 44px;
  }
}

/* Empty placeholder classes for dynamic binding */
.active {}
.following {}
</style>
