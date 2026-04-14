<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import type {
  NormalizedDriveFile,
  NormalizedNote,
  NormalizedUser,
} from '@/adapters/types'
import { useAutocomplete } from '@/composables/useAutocomplete'
import { useMentionSearch } from '@/composables/useMentionSearch'
import { useMfmInsert } from '@/composables/useMfmInsert'
import { usePopupControl } from '@/composables/usePopupControl'
import { usePostFormState } from '@/composables/usePostFormState'
import {
  getAccountAvatarUrl,
  getAccountLabel,
  isGuestAccount,
} from '@/stores/accounts'
import { useSettingsStore } from '@/stores/settings'
import { useIsCompactLayout } from '@/stores/ui'
import { showLoginPrompt } from '@/utils/loginPrompt'
import { parseMfm } from '@/utils/mfm'
import MkAutocompletePopup from './MkAutocompletePopup.vue'
import MkDrivePicker from './MkDrivePicker.vue'
import MkMfm from './MkMfm.vue'
import MkNote from './MkNote.vue'
import MkReactionPicker from './MkReactionPicker.vue'

const props = defineProps<{
  accountId: string
  replyTo?: NormalizedNote
  renoteId?: string
  editNote?: NormalizedNote
  channelId?: string
  inline?: boolean
  initialText?: string
  initialCw?: string
  initialVisibility?: string
  initialLocalOnly?: boolean
  initialFilePaths?: string[]
}>()

const emit = defineEmits<{
  close: []
  posted: [editedNoteId?: string]
}>()

const isCompact = useIsCompactLayout()
const settingsStore = useSettingsStore()
const textareaRef = ref<HTMLTextAreaElement | null>(null)
const fileInput = ref<HTMLInputElement | null>(null)
const showPreview = computed<boolean>({
  get: () => settingsStore.get('postForm.preview') ?? false,
  set: (v) => {
    settingsStore.set('postForm.preview', v)
  },
})

const {
  text,
  cw,
  showCw,
  visibility,
  localOnly,
  showVisibilityMenu,
  showAccountMenu,
  isPosting,
  posted,
  error,
  attachedFiles,
  isUploading,
  noteModeFlags,
  disabledVisibilities,
  activeAccountId,
  accounts,
  account,
  formThemeVars,
  currentVisibility,
  remainingChars,
  canPost,
  MAX_TEXT_LENGTH,
  visibilityOptions,
  showPoll,
  pollChoices,
  pollMultiple,
  pollExpiresAt,
  scheduledAt,
  supportsScheduledNotes,
  drafts,
  showDraftMenu,
  initAdapter,
  switchAccount,
  post,
  openFilePicker,
  onFileSelected,
  uploadFilesFromPaths,
  attachDriveFiles,
  removeFile,
  selectVisibility,
  noteModeLabel,
  noteModeIcon,
  insertAtCursor,
  addPollChoice,
  removePollChoice,
  resetForm,
  saveCurrentDraft,
  restoreDraft,
  removeDraft,
} = usePostFormState(
  props,
  {
    onPosted: (id) => {
      emit('posted', id)
      if (props.inline) {
        // Reset form for next post instead of closing
        resetForm()
      }
    },
  },
  fileInput,
)

// Stable keys for poll choices (avoid index-based v-for key bugs on add/remove)
let pollKeyCounter = 0
const pollChoiceKeys = ref<number[]>(
  pollChoices.value.map(() => pollKeyCounter++),
)

const origAddPollChoice = addPollChoice
const origRemovePollChoice = removePollChoice
const addPollChoiceKeyed = () => {
  origAddPollChoice()
  pollChoiceKeys.value.push(pollKeyCounter++)
}
const removePollChoiceKeyed = (index: number) => {
  origRemovePollChoice(index)
  pollChoiceKeys.value.splice(index, 1)
}

// --- Popup exclusive control ---
const popups = usePopupControl()
popups.track(showDraftMenu)
const showSchedulePopup = popups.register()
const showEmojiPopup = popups.register()
const showAttachMenu = popups.register()

const showMoreMenu = popups.register()

function toggleSchedulePopup() {
  popups.toggle(showSchedulePopup)
}

function setSchedule(value: string | null) {
  if (value) {
    scheduledAt.value = new Date(value).toISOString()
  } else {
    scheduledAt.value = null
  }
  showSchedulePopup.value = false
}

function formatScheduledDate(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

// --- Draft menu ---
function toggleDraftMenu() {
  popups.toggle(showDraftMenu)
}

/** Minimum datetime for schedule picker (5 minutes from now) */
function minScheduleDatetime(): string {
  const d = new Date(Date.now() + 5 * 60 * 1000)
  d.setSeconds(0, 0)
  return d.toISOString().slice(0, 16)
}

// --- Preview ---
const previewNote = computed<NormalizedNote | null>(() => {
  if (!showPreview.value) return null
  const acc = account.value
  if (!acc) return null
  return {
    id: `preview-${acc.id}`,
    _accountId: acc.id,
    _serverHost: acc.host,
    createdAt: new Date().toISOString(),
    text: text.value || null,
    cw: showCw.value && cw.value ? cw.value : null,
    user: {
      id: acc.userId,
      username: acc.username,
      host: null,
      name: acc.displayName,
      avatarUrl: acc.avatarUrl,
    },
    visibility: visibility.value,
    emojis: {},
    reactionEmojis: {},
    reactions: {},
    renoteCount: 0,
    repliesCount: 0,
    files: attachedFiles.value,
    localOnly: localOnly.value,
    replyId: props.replyTo?.id ?? null,
    renoteId: props.renoteId ?? null,
    channelId: props.channelId ?? null,
  }
})

// --- Mention popup ---
const {
  showMentionPopup,
  mentionQuery,
  mentionResults,
  mentionSearching,
  toggleMentionPopup: rawToggleMention,
  onMentionInput,
  pickMention: rawPickMention,
} = useMentionSearch(activeAccountId)
popups.track(showMentionPopup)

function toggleMentionPopup() {
  rawToggleMention()
  popups.closeOthers(showMentionPopup)
}

function pickMention(user: Parameters<typeof rawPickMention>[0]) {
  rawPickMention(user, insertAtCursor, textareaRef)
}

// --- Emoji popup ---
function toggleEmojiPopup() {
  popups.toggle(showEmojiPopup)
}

function pickEmoji(reaction: string) {
  insertAtCursor(textareaRef.value, reaction)
  showEmojiPopup.value = false
}

// --- Hashtag ---
function insertHashtag() {
  insertAtCursor(textareaRef.value, '#')
}

// --- MFM menu ---
const {
  showMfmMenu,
  mfmFunctions,
  toggleMfmMenu: rawToggleMfm,
  pickMfm,
} = useMfmInsert(textareaRef, text)
popups.track(showMfmMenu)

function toggleMfmMenu() {
  rawToggleMfm()
  popups.closeOthers(showMfmMenu)
}

// --- Autocomplete ---
const serverHost = computed(() => account.value?.host ?? '')
const {
  autocompleteState,
  candidates: acCandidates,
  isSearching: acSearching,
  onTextInput: acOnTextInput,
  onCompositionStart: acOnCompositionStart,
  onCompositionEnd: acOnCompositionEnd,
  handleKeydown: acHandleKeydown,
  confirmSelection: acConfirmSelection,
  dismiss: acDismiss,
} = useAutocomplete(text, textareaRef, activeAccountId, serverHost)

// --- File attach menu ---
const showDrivePicker = ref(false)

function toggleAttachMenu() {
  popups.toggle(showAttachMenu)
}

function attachFromLocal() {
  showAttachMenu.value = false
  openFilePicker()
}

function attachFromDrive() {
  showAttachMenu.value = false
  showDrivePicker.value = true
}

function onDriveFilesPicked(driveFiles: NormalizedDriveFile[]) {
  attachDriveFiles(driveFiles)
  showDrivePicker.value = false
}

// --- Close popups on form click ---
function toggleMoreMenu() {
  popups.toggle(showMoreMenu)
}

function closePopups() {
  popups.closeAll()
  acDismiss()
}

onMounted(async () => {
  await initAdapter()
  if (props.editNote) {
    text.value = props.editNote.text ?? ''
    if (props.editNote.cw) {
      cw.value = props.editNote.cw
      showCw.value = true
    }
    visibility.value = props.editNote.visibility
  } else if (props.replyTo) {
    visibility.value = props.replyTo.visibility
    const myUserId = account.value?.userId
    const mentions: string[] = []
    const seen = new Set<string>()

    // 1. Reply target user
    const replyUser = props.replyTo.user
    if (replyUser.id !== myUserId) {
      const acct = replyUser.host
        ? `@${replyUser.username}@${replyUser.host}`
        : `@${replyUser.username}`
      mentions.push(acct)
      seen.add(acct.toLowerCase())
    }

    // 2. Mentions in the reply target's text (reply chain participants)
    if (props.replyTo.text) {
      for (const token of parseMfm(props.replyTo.text)) {
        if (token.type !== 'mention') continue
        const acct = token.acct
        const lower = acct.toLowerCase()
        if (seen.has(lower)) continue
        // Skip self
        const isSelf = token.host
          ? token.username.toLowerCase() ===
              account.value?.username?.toLowerCase() &&
            token.host.toLowerCase() === account.value?.host?.toLowerCase()
          : token.username.toLowerCase() ===
            account.value?.username?.toLowerCase()
        if (isSelf) continue
        seen.add(lower)
        mentions.push(acct)
      }
    }

    if (mentions.length > 0) {
      text.value = `${mentions.join(' ')} `
    }
  }
  if (props.initialText) text.value = props.initialText
  if (props.initialCw) {
    cw.value = props.initialCw
    showCw.value = true
  }
  if (props.initialVisibility)
    visibility.value = props.initialVisibility as typeof visibility.value
  if (props.initialLocalOnly) localOnly.value = true
  if (props.initialFilePaths?.length) {
    uploadFilesFromPaths(props.initialFilePaths)
  }
  await nextTick()
  if (!props.inline) textareaRef.value?.focus()
})

// Watch for additional file drops while the form is open
watch(
  () => props.initialFilePaths,
  (paths) => {
    if (paths?.length) uploadFilesFromPaths(paths)
  },
)

let overlayPointerDown = false

function onOverlayPointerDown(e: PointerEvent) {
  overlayPointerDown = e.target === e.currentTarget
}

function onOverlayClick(e: MouseEvent) {
  if (overlayPointerDown && e.target === e.currentTarget) {
    emit('close')
  }
  overlayPointerDown = false
}

function onKeydown(e: KeyboardEvent) {
  if (acHandleKeydown(e)) return
  if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
    if (!isPosting.value) post()
  }
  if (e.key === 'Escape' && !props.inline) {
    emit('close')
  }
}
</script>

<template>
  <div :class="[inline ? $style.postInlineWrapper : $style.postOverlay, { [$style.mobile]: isCompact }]" @pointerdown="!inline && onOverlayPointerDown($event)" @click="!inline && onOverlayClick($event)">
    <div data-post-form :class="[$style.postForm, { [$style.postFormInline]: inline }]" :style="formThemeVars" @click.stop="closePopups">
      <!-- Header -->
      <header :class="$style.header">
        <div v-if="!inline" :class="$style.headerLeft">
          <button class="_button" :class="$style.headerBtn" title="閉じる" @click="emit('close')">
            <i class="ti ti-x" />
          </button>
          <div v-if="account" :class="$style.accountWrapper">
            <button
              class="_button"
              :class="$style.accountBtn"
              :title="getAccountLabel(account)"
              @click="showAccountMenu = !showAccountMenu"
            >
              <img
                :src="getAccountAvatarUrl(account)"
                :class="$style.accountAvatar"
              />
            </button>
            <div v-if="showAccountMenu && accounts.length > 1" :class="$style.accountMenu">
              <button
                v-for="acc in accounts"
                :key="acc.id"
                class="_button"
                :class="[$style.accountOption, { [$style.active]: acc.id === activeAccountId, [$style.accountDisabled]: isGuestAccount(acc) }]"
                :disabled="isGuestAccount(acc)"
                @click="acc.hasToken ? switchAccount(acc.id) : showLoginPrompt()"
              >
                <img
                  :src="getAccountAvatarUrl(acc)"
                  :class="$style.accountOptionAvatar"
                  width="24"
                  height="24"
                />
                <div :class="$style.accountOptionInfo">
                  <span :class="$style.accountOptionName">{{ isGuestAccount(acc) ? (acc.displayName || 'ゲスト') : acc.username }}</span>
                  <span :class="$style.accountOptionHost">@{{ acc.host }}</span>
                </div>
              </button>
            </div>
          </div>
        </div>
        <div v-else :class="$style.headerLeft" />
        <div :class="$style.headerRight">
          <!-- Note mode flags -->
          <button
            v-for="(val, key) in noteModeFlags"
            :key="key"
            class="_button"
            :class="[$style.headerBtn, $style.noteModeBtn, { [$style.active]: val }]"
            :title="noteModeLabel(key as string)"
            @click="noteModeFlags[key as string] = !noteModeFlags[key as string]"
          >
            <svg viewBox="0 0 24 24" width="18" height="18">
              <path
                :d="noteModeIcon(key as string)"
                stroke="currentColor"
                stroke-width="1.5"
                stroke-linecap="round"
                stroke-linejoin="round"
                fill="none"
              />
            </svg>
          </button>

          <!-- Visibility (hidden in inline channel mode: always public) -->
          <div v-if="!inline" :class="$style.visibilityWrapper">
            <button
              class="_button"
              :class="$style.headerBtn"
              :title="currentVisibility.label"
              @click="showVisibilityMenu = !showVisibilityMenu"
            >
              <svg viewBox="0 0 24 24" width="18" height="18">
                <path
                  :d="currentVisibility.icon"
                  stroke="currentColor"
                  stroke-width="1.5"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  fill="none"
                />
              </svg>
              <span :class="$style.headerBtnText">{{ currentVisibility.label }}</span>
            </button>
            <div v-if="showVisibilityMenu" :class="$style.visibilityMenu">
              <button
                v-for="opt in visibilityOptions"
                :key="opt.value"
                class="_button"
                :class="[$style.visibilityOption, { [$style.active]: visibility === opt.value }]"
                :disabled="disabledVisibilities.has(opt.value)"
                @click="selectVisibility(opt.value)"
              >
                <svg viewBox="0 0 24 24" width="16" height="16">
                  <path
                    :d="opt.icon"
                    stroke="currentColor"
                    stroke-width="1.5"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    fill="none"
                  />
                </svg>
                {{ opt.label }}
              </button>
            </div>
          </div>

          <!-- Local only (hidden in inline channel mode: always local-only) -->
          <button
            v-if="!inline && visibility !== 'specified'"
            class="_button"
            :class="[$style.headerBtn, $style.localOnlyBtn, { [$style.active]: localOnly }]"
            :title="localOnly ? 'ローカルのみ (連合なし)' : '連合あり'"
            @click="localOnly = !localOnly"
          >
            <i :class="localOnly ? 'ti ti-rocket-off' : 'ti ti-rocket'" />
          </button>

          <!-- More menu (preview, drafts, schedule) -->
          <div :class="$style.moreMenuWrapper">
            <button
              class="_button"
              :class="$style.headerBtn"
              title="その他"
              @click.stop="toggleMoreMenu"
            >
              <i class="ti ti-dots" />
            </button>
            <div v-if="showMoreMenu" :class="$style.moreMenu" @click.stop>
              <!-- Preview toggle -->
              <div
                :class="$style.moreMenuItem"
                role="switch"
                :aria-checked="showPreview"
                @click="showPreview = !showPreview"
              >
                <i class="ti ti-eye" />
                プレビュー
                <span
                  class="nd-toggle-switch"
                  :class="{ on: showPreview }"
                  :style="{ marginLeft: 'auto' }"
                  aria-hidden="true"
                >
                  <span class="nd-toggle-switch-knob" />
                </span>
              </div>
              <!-- Draft save -->
              <button
                class="_button"
                :class="$style.moreMenuItem"
                @click="saveCurrentDraft(); showMoreMenu = false"
              >
                <i class="ti ti-device-floppy" />
                下書きを保存
              </button>
              <!-- Draft list -->
              <button
                class="_button"
                :class="[$style.moreMenuItem, { [$style.active]: showDraftMenu }]"
                @click.stop="showDraftMenu = !showDraftMenu"
              >
                <i class="ti ti-notes" />
                下書き
                <span v-if="drafts.length > 0" :class="$style.moreMenuBadge">{{ drafts.length }}</span>
              </button>
              <!-- Draft list popup (nested) -->
              <div v-if="showDraftMenu" :class="$style.moreMenuDraftList">
                <div
                  v-for="d in drafts"
                  :key="d.id"
                  :class="$style.draftItem"
                >
                  <button class="_button" :class="$style.draftItemMain" @click="restoreDraft(d); showMoreMenu = false">
                    <span :class="$style.draftItemText">{{ d.text || '(空)' }}</span>
                    <span :class="$style.draftItemDate">{{ new Date(d.savedAt).toLocaleDateString() }}</span>
                  </button>
                  <button
                    class="_button"
                    :class="$style.draftItemDelete"
                    title="下書きを削除"
                    @click.stop="removeDraft(d.id)"
                  >
                    <i class="ti ti-x" />
                  </button>
                </div>
                <div v-if="drafts.length === 0" :class="$style.draftEmpty">下書きはありません</div>
              </div>
              <!-- Schedule (only if server supports it) -->
              <template v-if="supportsScheduledNotes && !editNote">
                <div :class="$style.moreMenuDivider" />
                <button
                  class="_button"
                  :class="[$style.moreMenuItem, { [$style.active]: !!scheduledAt }]"
                  @click.stop="showSchedulePopup = !showSchedulePopup"
                >
                  <i class="ti ti-clock" />
                  予約投稿
                  <span v-if="scheduledAt" :class="$style.moreMenuScheduleBadge">{{ formatScheduledDate(scheduledAt) }}</span>
                </button>
                <div v-if="showSchedulePopup" :class="$style.moreMenuSchedulePicker" @click.stop>
                  <input
                    type="datetime-local"
                    :class="$style.scheduleDatetimeInput"
                    :min="minScheduleDatetime()"
                    :value="scheduledAt ? scheduledAt.slice(0, 16) : ''"
                    @change="setSchedule(($event.target as HTMLInputElement).value || null)"
                  />
                  <button
                    v-if="scheduledAt"
                    class="_button"
                    :class="$style.scheduleClearBtn"
                    @click="setSchedule(null)"
                  >
                    予約を解除
                  </button>
                </div>
              </template>
            </div>
          </div>

          <!-- Submit -->
          <button
            :class="[$style.submitBtn, { [$style.posted]: posted, [$style.scheduled]: !!scheduledAt }]"
            :disabled="!canPost"
            @click="post"
          >
            <template v-if="posted">
              <svg viewBox="0 0 24 24" width="16" height="16">
                <path d="M20 6L9 17l-5-5" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" fill="none" />
              </svg>
            </template>
            <template v-else-if="isPosting">
              <span :class="$style.postingDots">...</span>
            </template>
            <template v-else-if="scheduledAt">
              <svg viewBox="0 0 24 24" width="16" height="16" :class="$style.submitIcon">
                <circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="2" fill="none" />
                <path d="M12 6v6l4 2" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" fill="none" />
              </svg>
              予約投稿
            </template>
            <template v-else>
              <svg viewBox="0 0 24 24" width="16" height="16" :class="$style.submitIcon">
                <template v-if="editNote">
                  <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" fill="none" />
                </template>
                <template v-else-if="replyTo">
                  <path d="M9 14L4 9l5-5M4 9h10.5a5.5 5.5 0 010 11H11" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" fill="none" />
                </template>
                <template v-else-if="renoteId">
                  <path d="M10 11h6m-3-3v6M3 8V6a2 2 0 012-2h14a2 2 0 012 2v12a2 2 0 01-2 2H5a2 2 0 01-2-2v-2" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" fill="none" />
                </template>
                <template v-else>
                  <path d="M22 2L11 13M22 2l-7 20-4-9-9-4z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" fill="none" />
                </template>
              </svg>
              {{ editNote ? '編集' : replyTo ? '返信' : renoteId ? '引用' : 'ノート' }}
            </template>
          </button>
        </div>
      </header>

      <!-- Reply preview -->
      <div v-if="replyTo" :class="$style.replyPreview">
        <img
          v-if="replyTo.user.avatarUrl"
          :src="replyTo.user.avatarUrl"
          :class="$style.replyAvatar"
        />
        <div :class="$style.replyContent">
          <span :class="$style.replyUser">
            <MkMfm v-if="replyTo.user.name" :text="replyTo.user.name" :emojis="replyTo.user.emojis" :server-host="replyTo._serverHost" plain />
            <template v-else>{{ replyTo.user.username }}</template>
          </span>
          <span :class="$style.replyHandle">@{{ replyTo.user.username }}</span>
          <p :class="$style.replyText">{{ replyTo.text }}</p>
        </div>
      </div>

      <!-- Quote indicator -->
      <div v-if="renoteId && !replyTo" :class="$style.quoteIndicator">
        <svg viewBox="0 0 24 24" width="14" height="14">
          <path d="M10 11h6m-3-3v6M3 8V6a2 2 0 012-2h14a2 2 0 012 2v12a2 2 0 01-2 2H5a2 2 0 01-2-2v-2" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" fill="none" />
        </svg>
        引用付き
      </div>

      <!-- Schedule indicator -->
      <div v-if="scheduledAt" :class="$style.scheduleIndicator">
        <svg viewBox="0 0 24 24" width="14" height="14">
          <circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="2" fill="none" />
          <path d="M12 6v6l4 2" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" fill="none" />
        </svg>
        {{ formatScheduledDate(scheduledAt) }}
        <button class="_button" :class="$style.scheduleClear" @click="scheduledAt = null">
          <i class="ti ti-x" />
        </button>
      </div>

      <!-- CW input -->
      <div v-if="showCw" :class="$style.cwOuter">
        <input
          v-model="cw"
          :class="$style.cwInput"
          placeholder="閲覧注意"
          autocomplete="off"
        />
      </div>

      <!-- Textarea -->
      <div :class="[$style.textOuter, { [$style.withCw]: showCw }]">
        <textarea
          ref="textareaRef"
          v-model="text"
          :class="$style.textArea"
          :maxlength="MAX_TEXT_LENGTH"
          :placeholder="replyTo ? '返信...' : renoteId ? '引用...' : '今どんな気分？'"
          autocomplete="off"
          autocorrect="off"
          autocapitalize="sentences"
          spellcheck="false"
          @keydown="onKeydown"
          @input="acOnTextInput"
          @compositionstart="acOnCompositionStart"
          @compositionend="acOnCompositionEnd"
          @click.stop
        />
        <MkAutocompletePopup
          v-if="autocompleteState && acCandidates.length > 0"
          :type="autocompleteState.type"
          :candidates="acCandidates"
          :selected-index="autocompleteState.selectedIndex"
          :is-searching="acSearching"
          @select="acConfirmSelection"
        />
        <span
          v-if="remainingChars <= 100"
          class="_acrylic"
          :class="[$style.textCount, { [$style.over]: remainingChars < 0 }]"
        >{{ remainingChars }}</span>
      </div>

      <!-- Preview -->
      <div v-if="showPreview" :class="$style.previewSection">
        <MkNote v-if="previewNote" :note="previewNote" embedded />
        <div v-else :class="$style.previewEmpty">アカウントが選択されていません</div>
      </div>

      <!-- Poll editor -->
      <div v-if="showPoll" :class="$style.pollEditor">
        <div v-for="(_, i) in pollChoices" :key="pollChoiceKeys[i]" :class="$style.pollChoiceRow">
          <input
            v-model="pollChoices[i]"
            :class="$style.pollChoiceInput"
            :placeholder="`選択肢 ${i + 1}`"
          />
          <button
            v-if="pollChoices.length > 2"
            class="_button"
            :class="$style.pollChoiceRemove"
            @click="removePollChoiceKeyed(i)"
          >
            <i class="ti ti-x" />
          </button>
        </div>
        <div :class="$style.pollActions">
          <button
            v-if="pollChoices.length < 10"
            class="_button"
            :class="$style.pollAddBtn"
            @click="addPollChoiceKeyed"
          >
            <i class="ti ti-plus" /> 選択肢を追加
          </button>
          <label :class="$style.pollMultipleLabel">
            <input v-model="pollMultiple" type="checkbox" />
            複数選択
          </label>
        </div>
      </div>

      <!-- File previews -->
      <div v-if="attachedFiles.length > 0 || isUploading" :class="$style.filePreviewArea">
        <div v-for="file in attachedFiles" :key="file.id" :class="$style.filePreview">
          <img
            v-if="file.thumbnailUrl || file.type.startsWith('image/')"
            :src="file.thumbnailUrl || file.url"
            :class="$style.fileThumb"
          />
          <div v-else :class="$style.fileIcon">
            <i class="ti ti-file-text" />
          </div>
          <button class="_button" :class="$style.fileRemove" title="削除" @click="removeFile(file.id)">
            <i class="ti ti-x" />
          </button>
        </div>
        <div v-if="isUploading" :class="$style.fileUploading">アップロード中...</div>
      </div>

      <!-- Hidden file input -->
      <input
        ref="fileInput"
        type="file"
        multiple
        accept="image/*,video/*,audio/*"
        style="display: none"
        @change="onFileSelected"
      />

      <!-- Error -->
      <div v-if="error" :class="$style.postError">{{ error }}</div>

      <!-- Footer -->
      <footer :class="$style.footer">
        <div :class="$style.footerLeft">
          <!-- Attach file -->
          <div :class="$style.footerPopupWrapper">
            <button
              class="_button"
              :class="$style.footerBtn"
              title="ファイルを添付"
              :disabled="isUploading"
              @click.stop="toggleAttachMenu"
            >
              <i class="ti ti-photo-plus" />
            </button>
            <div v-if="showAttachMenu" :class="[$style.footerPopup, $style.attachMenu]" @click.stop>
              <button class="_button" :class="$style.attachMenuItem" @click="attachFromLocal">
                <i class="ti ti-upload" />
                <span>アップロード</span>
              </button>
              <button class="_button" :class="$style.attachMenuItem" @click="attachFromDrive">
                <i class="ti ti-cloud" />
                <span>ドライブから</span>
              </button>
            </div>
          </div>

          <!-- Poll -->
          <button
            class="_button"
            :class="[$style.footerBtn, { [$style.active]: showPoll }]"
            title="投票"
            @click="showPoll = !showPoll"
          >
            <i class="ti ti-chart-arrows" />
          </button>

          <!-- CW -->
          <button
            class="_button"
            :class="[$style.footerBtn, { [$style.active]: showCw }]"
            title="閲覧注意"
            @click="showCw = !showCw"
          >
            <i class="ti ti-eye-off" />
          </button>

          <!-- Hashtag -->
          <button class="_button" :class="$style.footerBtn" title="ハッシュタグ" @click="insertHashtag">
            <i class="ti ti-hash" />
          </button>

          <!-- Mention -->
          <div :class="$style.footerPopupWrapper">
            <button class="_button" :class="$style.footerBtn" title="メンション" @click.stop="toggleMentionPopup">
              <i class="ti ti-at" />
            </button>
            <div v-if="showMentionPopup" :class="[$style.footerPopup, $style.mentionPopup]" @click.stop>
              <input
                v-model="mentionQuery"
                :class="$style.mentionSearchInput"
                type="text"
                placeholder="ユーザーを検索..."
                @input="onMentionInput"
              />
              <div :class="$style.mentionResults">
                <button
                  v-for="user in mentionResults"
                  :key="user.id"
                  class="_button"
                  :class="$style.mentionResultItem"
                  @click="pickMention(user)"
                >
                  <img v-if="user.avatarUrl" :src="user.avatarUrl" :class="$style.mentionAvatar" />
                  <div :class="$style.mentionInfo">
                    <span :class="$style.mentionName">{{ user.username }}</span>
                    <span v-if="user.host" :class="$style.mentionHost">@{{ user.host }}</span>
                  </div>
                </button>
                <div v-if="mentionSearching" :class="$style.mentionStatus">検索中...</div>
                <div v-else-if="mentionQuery && mentionResults.length === 0" :class="$style.mentionStatus">
                  ユーザーが見つかりません
                </div>
              </div>
            </div>
          </div>

          <!-- MFM -->
          <div :class="$style.footerPopupWrapper">
            <button class="_button" :class="$style.footerBtn" title="MFM" @click.stop="toggleMfmMenu">
              <i class="ti ti-palette" />
            </button>
            <div v-if="showMfmMenu" :class="[$style.footerPopup, $style.mfmMenu]" @click.stop>
              <button
                v-for="fn in mfmFunctions"
                :key="fn.label"
                class="_button"
                :class="$style.mfmMenuItem"
                @click="pickMfm(fn)"
              >
                {{ fn.label }}
              </button>
            </div>
          </div>

          <!-- Clear -->
          <button
            class="_button"
            :class="$style.footerBtn"
            title="クリア"
            @click="resetForm"
          >
            <i class="ti ti-trash" />
          </button>

        </div>
        <div :class="$style.footerRight">
          <!-- Emoji -->
          <div :class="$style.footerPopupWrapper">
            <button class="_button" :class="$style.footerBtn" title="絵文字" @click.stop="toggleEmojiPopup">
              <i class="ti ti-mood-happy" />
            </button>
            <div v-if="showEmojiPopup && account" :class="[$style.footerPopup, $style.emojiPopup]" @click.stop>
              <MkReactionPicker
                :server-host="account.host"
                :account-id="activeAccountId"
                @pick="pickEmoji"
              />
            </div>
          </div>
        </div>
      </footer>

    </div>

    <!-- Drive picker (below post form) -->
    <MkDrivePicker
      v-if="showDrivePicker"
      :account-id="activeAccountId!"
      @pick="onDriveFilesPicked"
      @close="showDrivePicker = false"
    />

  </div>
</template>

<style lang="scss" module>
.postOverlay {
  position: fixed;
  inset: 0;
  z-index: var(--nd-z-navbar);
  display: flex;
  flex-direction: column;
  align-items: center;
  padding-top: calc(var(--nd-app-inset-top, 0px) + 12px);
  background: var(--nd-modalBg);
  overflow-y: auto;
}

.postInlineWrapper {
  display: contents;
}

.postForm {
  background: var(--nd-popup);
  border-radius: 16px;
  box-shadow: 0 8px 32px var(--nd-shadow);
  width: 100%;
  max-width: 520px;
  margin: 16px;
  overflow: visible;
  display: flex;
  flex-direction: column;
  container-type: inline-size;

  /* ── Inline mode ── */
  &.postFormInline {
    background: transparent;
    border-radius: 0;
    box-shadow: none;
    max-width: none;
    margin: 0;
    flex-shrink: 0;
    border-bottom: 1px solid var(--nd-divider);

    .header {
      min-height: 36px;
    }

    .headerRight {
      min-height: 36px;
      font-size: 0.85em;
    }

    .headerBtn {
      padding: 5px;
    }

    .headerBtnText {
      display: none;
    }

    .textArea {
      min-height: 42px;
      padding: 0 12px;
      font-size: 0.95em;
      field-sizing: content;

      &::placeholder {
        font-size: 1em;
      }
    }

    .cwInput {
      padding: 6px 12px;
      font-size: 0.95em;

      &::placeholder {
        font-size: 1em;
      }
    }

    .footer {
      padding: 0 4px 4px;
      font-size: 0.9em;
    }

    .footerLeft {
      grid-template-columns: repeat(auto-fill, minmax(44px, 1fr));
      grid-auto-rows: 44px;
    }

    .footerRight {
      grid-template-columns: repeat(auto-fill, minmax(44px, 1fr));
      grid-auto-rows: 44px;
    }

    .submitBtn {
      margin: 6px 6px 6px 4px;
      padding: 0 10px;
      line-height: 30px;
      font-size: 0.85em;
      min-width: 70px;
    }

    .filePreviewArea {
      padding: 6px 12px;
    }

    .filePreview {
      width: 60px;
      height: 60px;
    }

    .pollEditor {
      padding: 6px 12px;
    }

    .replyPreview {
      padding: 8px 12px;
      font-size: 0.85em;
    }

    .postError {
      padding: 4px 12px;
      font-size: 0.8em;
    }
  }
}

/* ── Header ── */
.header {
  display: flex;
  flex-wrap: nowrap;
  align-items: center;
  min-height: 50px;
  gap: 4px;
}

.headerLeft {
  display: flex;
  flex: 1;
  flex-wrap: nowrap;
  align-items: center;
  gap: 6px;
  padding-left: 12px;
}

.headerRight {
  display: flex;
  min-height: 48px;
  font-size: 0.9em;
  flex-wrap: nowrap;
  align-items: center;
  margin-left: auto;
  gap: 4px;
  padding-left: 4px;
}

.headerBtn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px;
  min-height: 44px;
  min-width: 44px;
  margin: 0;
  border-radius: var(--nd-radius-sm);
  color: var(--nd-fg);
  transition: background var(--nd-duration-base);

  &:hover {
    background: light-dark(rgba(0, 0, 0, 0.05), rgba(255, 255, 255, 0.05));
  }
}

.headerBtnText {
  padding-left: 6px;
  overflow: clip;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 210px;
}

.accountWrapper {
  position: relative;
}

.accountBtn {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 8px;
  border-radius: var(--nd-radius-sm);
  transition: background var(--nd-duration-base);

  &:hover {
    background: light-dark(rgba(0, 0, 0, 0.05), rgba(255, 255, 255, 0.05));
  }
}

.accountAvatar {
  width: 28px;
  height: 28px;
  border-radius: 100%;
  object-fit: cover;
}

/* Account menu */
.accountMenu {
  position: absolute;
  top: 100%;
  left: 0;
  z-index: 10;
  padding: 4px;
  margin-top: 4px;
  background: color-mix(in srgb, var(--nd-popup) 96%, transparent);
  border-radius: 12px;
  box-shadow: var(--nd-shadow-m);
}

.accountOption {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 8px 12px;
  border-radius: var(--nd-radius-sm);
  color: var(--nd-fg);
  transition: background var(--nd-duration-base);

  &:hover {
    background: light-dark(rgba(0, 0, 0, 0.05), rgba(255, 255, 255, 0.05));
  }

  &.active {
    color: var(--nd-accent);
  }
}

.accountDisabled {
  opacity: 0.4;
  pointer-events: none;
}

.accountOptionAvatar {
  flex: 0 0 24px;
  width: 24px;
  height: 24px;
  border-radius: 100%;
  object-fit: cover;
}

.accountOptionInfo {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  min-width: 0;
}

.accountOptionName {
  font-size: 0.85em;
  font-weight: bold;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.accountOptionHost {
  font-size: 0.75em;
  opacity: 0.6;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* Submit button (Misskey gradient style) */
.submitBtn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  margin: 12px 12px 12px 6px;
  padding: 0 12px;
  line-height: 34px;
  font-weight: bold;
  font-family: inherit;
  border: none;
  border-radius: var(--nd-radius-sm);
  min-width: 90px;
  color: var(--nd-fgOnAccent);
  background: linear-gradient(90deg, var(--nd-buttonGradateA, var(--nd-accent)), var(--nd-buttonGradateB, var(--nd-accent)));
  cursor: pointer;
  transition: opacity var(--nd-duration-base), box-shadow var(--nd-duration-slow) ease;

  &:hover:not(:disabled) {
    opacity: 0.85;
    box-shadow: 0 4px 12px color-mix(in srgb, var(--nd-accent) 40%, transparent);
  }

  &:disabled {
    opacity: 0.7;
    cursor: not-allowed;
  }

  &.posted {
    background: var(--nd-success);
  }

  &.scheduled {
    background: var(--nd-accent);
  }
}

.postingDots {
  letter-spacing: 2px;
}

.submitIcon {
  flex-shrink: 0;
}

/* ── Visibility menu ── */
.visibilityWrapper {
  position: relative;
}

.visibilityMenu {
  position: absolute;
  top: 100%;
  right: 0;
  z-index: 10;
  min-width: 160px;
  padding: 4px;
  margin-top: 4px;
  background: color-mix(in srgb, var(--nd-popup) 96%, transparent);
  border-radius: 12px;
  box-shadow: var(--nd-shadow-m);
}

.visibilityOption {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 8px 12px;
  font-size: 0.85em;
  border-radius: var(--nd-radius-sm);
  color: var(--nd-fg);
  transition: background var(--nd-duration-base);

  &:hover {
    background: light-dark(rgba(0, 0, 0, 0.05), rgba(255, 255, 255, 0.05));
  }

  &.active {
    color: var(--nd-accent);
    font-weight: bold;
  }

  &:disabled {
    opacity: 0.35;
    cursor: not-allowed;
  }
}

/* ── Local only button ── */
.localOnlyBtn {
  &.active {
    color: var(--nd-error);
  }
}

/* ── More menu ── */
.moreMenuWrapper {
  position: relative;
}

.moreMenu {
  position: absolute;
  top: 100%;
  right: 0;
  z-index: 10;
  min-width: 200px;
  padding: 4px;
  margin-top: 4px;
  background: color-mix(in srgb, var(--nd-popup) 96%, transparent);
  border-radius: 12px;
  box-shadow: var(--nd-shadow-m);
}

.moreMenuItem {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 8px 12px;
  font-size: 0.85em;
  border-radius: var(--nd-radius-sm);
  color: var(--nd-fg);
  cursor: pointer;
  user-select: none;
  transition: background var(--nd-duration-base);

  &:hover {
    background: light-dark(rgba(0, 0, 0, 0.05), rgba(255, 255, 255, 0.05));
  }

  &.active {
    color: var(--nd-accent);
  }
}

.moreMenuBadge {
  margin-left: auto;
  font-size: 0.75em;
  padding: 1px 6px;
  border-radius: 10px;
  background: var(--nd-accent);
  color: var(--nd-fgOnAccent);
}

.moreMenuDivider {
  height: 1px;
  margin: 2px 8px;
  background: var(--nd-divider);
}

.moreMenuScheduleBadge {
  margin-left: auto;
  font-size: 0.75em;
  opacity: 0.7;
}

.moreMenuDraftList {
  max-height: 200px;
  overflow-y: auto;
  padding: 0 4px 4px;
  scrollbar-width: none;
}

.moreMenuSchedulePicker {
  padding: 8px 12px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

/* ── Note mode button ── */
.noteModeBtn {
  &.active {
    color: var(--nd-accent);
  }
}

/* ── Reply preview ── */
.replyPreview {
  display: flex;
  padding: 12px 20px 16px;
  font-size: 0.95em;
  gap: 10px;
}

.replyAvatar {
  width: 36px;
  height: 36px;
  border-radius: 100%;
  object-fit: cover;
  flex-shrink: 0;
}

.replyContent {
  min-width: 0;
  max-height: 100px;
  overflow-y: auto;
}

.replyUser {
  font-weight: bold;
  font-size: 0.9em;
  color: var(--nd-fgHighlighted);
}

.replyHandle {
  font-size: 0.8em;
  opacity: 0.5;
  margin-left: 4px;
}

.replyText {
  margin: 4px 0 0;
  white-space: pre-wrap;
  word-break: break-word;
  line-height: 1.4;
  color: var(--nd-fg);
  opacity: 0.8;
}

/* ── Quote indicator ── */
.quoteIndicator {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 24px;
  font-size: 0.85em;
  color: var(--nd-accent);
}

/* ── CW input ── */
.cwOuter {
  width: 100%;
}

.cwInput {
  display: block;
  box-sizing: border-box;
  width: 100%;
  padding: 8px 24px;
  padding-bottom: 8px;
  font-size: 110%;
  font-family: inherit;
  color: var(--nd-fg);
  background: transparent;
  border: none;
  border-bottom: 0.5px solid var(--nd-divider);
  outline: none;
}

/* ── Textarea ── */
.textOuter {
  width: 100%;
  position: relative;

  &.withCw {
    padding-top: 8px;
  }
}

.textArea {
  display: block;
  box-sizing: border-box;
  width: 100%;
  padding: 0 24px;
  margin: 0;
  min-height: 90px;
  max-height: 500px;
  font-size: 110%;
  font-family: inherit;
  color: var(--nd-fg);
  background: transparent;
  border: none;
  border-radius: 0;
  outline: none;
  resize: vertical;
  line-height: 1.5;
  field-sizing: content;
}

.textArea::placeholder,
.cwInput::placeholder {
  color: var(--nd-fg);
  opacity: 0.35;
}

/* ── Preview ── */
.previewSection {
  border-top: 1px solid color-mix(in srgb, var(--nd-fg) 12%, transparent);
  max-height: 360px;
  overflow-y: auto;
  scrollbar-width: thin;
}

.previewEmpty {
  padding: 16px 0;
  text-align: center;
  color: var(--nd-fg);
  opacity: 0.35;
  font-size: 0.9em;
}

/* ── Error ── */
.postError {
  padding: 8px 24px;
  color: var(--nd-error);
  font-size: 0.85em;
}

/* ── Text count (overlaid on textarea) ── */
.textCount {
  position: absolute;
  top: 0;
  right: 2px;
  padding: 4px 6px;
  font-size: 0.9em;
  color: var(--nd-warn, #ecb637);
  border-radius: var(--nd-radius-sm);
  min-width: 1.6em;
  text-align: center;

  &.over {
    color: var(--nd-error);
  }
}

/* ── Poll editor ── */
.pollEditor {
  padding: 8px 24px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.pollChoiceRow {
  display: flex;
  align-items: center;
  gap: 4px;
}

.pollChoiceInput {
  flex: 1;
  padding: 6px 10px;
  font-size: 0.9em;
  font-family: inherit;
  color: var(--nd-fg);
  background: var(--nd-buttonBg);
  border: none;
  border-radius: var(--nd-radius-sm);
  outline: none;

  &::placeholder {
    color: var(--nd-fg);
    opacity: 0.35;
  }
}

.pollChoiceRemove {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border-radius: var(--nd-radius-sm);
  color: var(--nd-fg);
  opacity: 0.5;
  flex-shrink: 0;

  &:hover {
    opacity: 1;
    background: light-dark(rgba(0, 0, 0, 0.05), rgba(255, 255, 255, 0.05));
  }
}

.pollActions {
  display: flex;
  align-items: center;
  gap: 12px;
  padding-top: 2px;
}

.pollAddBtn {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 4px 8px;
  font-size: 0.8em;
  color: var(--nd-accent);
  border-radius: var(--nd-radius-sm);

  &:hover {
    background: light-dark(rgba(0, 0, 0, 0.05), rgba(255, 255, 255, 0.05));
  }
}

.pollMultipleLabel {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 0.8em;
  color: var(--nd-fg);
  opacity: 0.7;
  cursor: pointer;
}

/* ── Footer ── */
.footer {
  display: flex;
  padding: 0 4px 4px;
  font-size: 1em;
}

.footerLeft {
  flex: 1;
  display: grid;
  grid-auto-flow: row;
  grid-template-columns: repeat(auto-fill, minmax(44px, 1fr));
  grid-auto-rows: 44px;
}

.footerRight {
  flex: 0;
  margin-left: auto;
  display: grid;
  grid-auto-flow: row;
  grid-template-columns: repeat(auto-fill, minmax(44px, 1fr));
  grid-auto-rows: 44px;
  direction: rtl;
}

.footerPopupWrapper {
  position: relative;
}

.footerBtn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  margin: 0;
  font-size: 1.15em;
  width: 100%;
  height: 100%;
  border-radius: var(--nd-radius-sm);
  color: var(--nd-fg);
  transition: background var(--nd-duration-base), color var(--nd-duration-base);

  &:hover {
    background: light-dark(rgba(0, 0, 0, 0.05), rgba(255, 255, 255, 0.05));
  }

  &.active {
    color: var(--nd-accent);
  }
}

/* ── Footer popups (shared) ── */
.footerPopup {
  position: absolute;
  top: 100%;
  left: 50%;
  transform: translateX(-50%);
  z-index: 20;
  margin-top: 8px;
  background: color-mix(in srgb, var(--nd-popup) 96%, transparent);
  border-radius: 12px;
  box-shadow: var(--nd-shadow-m);
}

/* ── Mention popup ── */
.mentionPopup {
  width: 260px;
  max-height: 300px;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.mentionSearchInput {
  width: 100%;
  padding: 8px 12px;
  border: none;
  border-bottom: 1px solid var(--nd-divider);
  background: transparent;
  color: var(--nd-fg);
  font-size: 0.85em;
  font-family: inherit;
  outline: none;
  box-sizing: border-box;
}

.mentionResults {
  flex: 1;
  overflow-y: auto;
  padding: 4px;
  scrollbar-width: none;
}

.mentionResultItem {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 8px;
  border-radius: var(--nd-radius-sm);
  color: var(--nd-fg);
  transition: background var(--nd-duration-base);

  &:hover {
    background: light-dark(rgba(0, 0, 0, 0.05), rgba(255, 255, 255, 0.05));
  }
}

.mentionAvatar {
  width: 28px;
  height: 28px;
  border-radius: 100%;
  object-fit: cover;
  flex-shrink: 0;
}

.mentionInfo {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.mentionName {
  font-size: 0.85em;
  font-weight: bold;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.mentionHost {
  font-size: 0.75em;
  opacity: 0.6;
}

.mentionStatus {
  padding: 12px;
  text-align: center;
  font-size: 0.8em;
  opacity: 0.5;
}

/* ── Emoji popup ── */
.emojiPopup {
  width: 320px;
  max-height: 360px;
  overflow: hidden;
  /* Override default centering: anchor to right edge since it's in footer-right */
  left: auto;
  right: 0;
  transform: none;
  direction: ltr;
}

/* ── MFM menu ── */
.mfmMenu {
  width: 160px;
  max-height: 320px;
  overflow-y: auto;
  padding: 4px;
  scrollbar-width: none;
}

.mfmMenuItem {
  display: block;
  width: 100%;
  padding: 6px 10px;
  font-size: 0.82em;
  text-align: left;
  border-radius: var(--nd-radius-sm);
  color: var(--nd-fg);
  transition: background var(--nd-duration-base);

  &:hover {
    background: light-dark(rgba(0, 0, 0, 0.05), rgba(255, 255, 255, 0.05));
  }
}

/* ── File preview ── */
.filePreviewArea {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  padding: 8px 24px;
}

.filePreview {
  position: relative;
  width: 80px;
  height: 80px;
  border-radius: var(--nd-radius-md);
  overflow: hidden;
  background: var(--nd-buttonBg);
}

.fileThumb {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.fileIcon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
  color: var(--nd-fg);
  opacity: 0.5;
}

.fileRemove {
  position: absolute;
  top: 0;
  right: 0;
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  background: var(--nd-overlayDark);
  color: #fff;
  cursor: pointer;
}

.fileUploading {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 80px;
  height: 80px;
  border-radius: var(--nd-radius-md);
  background: var(--nd-buttonBg);
  font-size: 0.7em;
  opacity: 0.6;
}

/* ── Schedule indicator ── */
.scheduleIndicator {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 24px;
  font-size: 0.82em;
  color: var(--nd-accent);
}

.scheduleClear {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  font-size: 0.8em;
  color: var(--nd-fg);
  opacity: 0.5;
  margin-left: 2px;

  &:hover {
    opacity: 1;
    background: light-dark(rgba(0, 0, 0, 0.05), rgba(255, 255, 255, 0.05));
  }
}

/* ── Draft menu ── */
.draftMenu {
  width: 280px;
  max-height: 360px;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.draftMenuItem {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 10px 12px;
  font-size: 0.85em;
  color: var(--nd-fg);
  border-radius: var(--nd-radius-sm);
  transition: background var(--nd-duration-base);

  &:hover {
    background: light-dark(rgba(0, 0, 0, 0.05), rgba(255, 255, 255, 0.05));
  }
}

.draftSave {
  color: var(--nd-accent);
  font-weight: bold;
}

.draftDivider {
  height: 1px;
  margin: 2px 8px;
  background: var(--nd-divider);
}

.draftList {
  flex: 1;
  overflow-y: auto;
  padding: 4px;
  scrollbar-width: none;
}

.draftItem {
  display: flex;
  align-items: center;
  border-radius: var(--nd-radius-sm);
  transition: background var(--nd-duration-base);

  &:hover {
    background: light-dark(rgba(0, 0, 0, 0.05), rgba(255, 255, 255, 0.05));
  }
}

.draftItemMain {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 8px;
  min-width: 0;
  text-align: left;
  color: var(--nd-fg);
}

.draftItemText {
  font-size: 0.82em;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.draftItemDate {
  font-size: 0.72em;
  opacity: 0.5;
}

.draftItemDelete {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  flex-shrink: 0;
  border-radius: var(--nd-radius-sm);
  color: var(--nd-fg);
  opacity: 0.4;

  &:hover {
    opacity: 1;
    background: light-dark(rgba(0, 0, 0, 0.05), rgba(255, 255, 255, 0.05));
  }
}

.draftEmpty {
  padding: 16px;
  text-align: center;
  font-size: 0.8em;
  opacity: 0.5;
}

/* ── Schedule popup ── */
.schedulePopup {
  width: 240px;
  padding: 12px;
}

.schedulePopupContent {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.scheduleDatetimeInput {
  width: 100%;
  padding: 8px;
  font-size: 0.85em;
  font-family: inherit;
  color: var(--nd-fg);
  background: var(--nd-buttonBg);
  border: none;
  border-radius: var(--nd-radius-sm);
  outline: none;
  box-sizing: border-box;
}

.scheduleClearBtn {
  padding: 6px;
  font-size: 0.8em;
  color: var(--nd-error);
  border-radius: var(--nd-radius-sm);
  text-align: center;

  &:hover {
    background: light-dark(rgba(0, 0, 0, 0.05), rgba(255, 255, 255, 0.05));
  }
}

/* ── Responsive ── */
@container (max-width: 500px) {
  .headerBtnText {
    display: none;
  }

  .submitBtn {
    margin: 8px 8px 8px 4px;
    min-height: 44px;
  }

  .cwInput,
  .textArea {
    padding-left: 16px;
    padding-right: 16px;
  }

  .textArea {
    min-height: 80px;
  }

  .footerLeft,
  .footerRight {
    grid-template-columns: repeat(auto-fill, minmax(44px, 1fr));
    grid-auto-rows: 44px;
  }

  .pollEditor {
    padding: 8px 16px;
  }
}

@container (max-width: 350px) {
  .footer {
    font-size: 0.9em;
  }

  .footerLeft {
    grid-template-columns: repeat(auto-fill, minmax(44px, 1fr));
  }

  .headerRight {
    gap: 0;
  }
}

/* ── Attach menu ── */
.attachMenu {
  min-width: 200px;
  padding: 4px;
  left: 0;
  transform: none;
}

.attachMenuItem {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 8px 12px;
  font-size: 0.85em;
  color: var(--nd-fg);
  border-radius: var(--nd-radius-sm);
  transition: background var(--nd-duration-base);
  text-align: left;

  &:hover {
    background: var(--nd-buttonHoverBg);
  }

  :global(.ti) {
    font-size: 16px;
    opacity: 0.7;
  }
}

/* Mobile: デスクトップと同じ枠付きモーダル（背景は透過して背後のカラムが透ける） */
.mobile {
  &.postOverlay {
    padding-top: var(--nd-safe-area-top, env(safe-area-inset-top));
    padding-bottom: var(--nd-safe-area-bottom, env(safe-area-inset-bottom));
  }

  .emojiPopup {
    position: fixed;
    top: auto;
    bottom: 0;
    left: 0;
    right: 0;
    width: 100%;
    max-width: 100%;
    max-height: 50vh;
    border-radius: 16px 16px 0 0;
    margin: 0;
    z-index: 100;
    box-shadow: 0 -4px 24px rgba(0, 0, 0, 0.3);
    padding-bottom: var(--nd-safe-area-bottom, env(safe-area-inset-bottom));
  }
}
</style>
