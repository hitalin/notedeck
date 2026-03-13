<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import type { NormalizedDriveFile, NormalizedNote } from '@/adapters/types'
import {
  getPluginHandlers,
  setPluginAccountContext,
} from '@/aiscript/plugin-api'
import { useAutocomplete } from '@/composables/useAutocomplete'
import { useMentionSearch } from '@/composables/useMentionSearch'
import { useMfmInsert } from '@/composables/useMfmInsert'
import { usePostFormState } from '@/composables/usePostFormState'
import MkAutocompletePopup from './MkAutocompletePopup.vue'
import MkDrivePicker from './MkDrivePicker.vue'
import MkMediaGrid from './MkMediaGrid.vue'
import MkMfm from './MkMfm.vue'
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

const textareaRef = ref<HTMLTextAreaElement | null>(null)
const fileInput = ref<HTMLInputElement | null>(null)
const showPreview = ref(false)
const showMoreMenu = ref(false)

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

// --- Schedule popup ---
const showSchedulePopup = ref(false)

function toggleSchedulePopup() {
  showSchedulePopup.value = !showSchedulePopup.value
  showDraftMenu.value = false
  showMentionPopup.value = false
  showEmojiPopup.value = false
  showMfmMenu.value = false
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
  showDraftMenu.value = !showDraftMenu.value
  showSchedulePopup.value = false
  showMentionPopup.value = false
  showEmojiPopup.value = false
  showMfmMenu.value = false
}

/** Minimum datetime for schedule picker (5 minutes from now) */
function minScheduleDatetime(): string {
  const d = new Date(Date.now() + 5 * 60 * 1000)
  d.setSeconds(0, 0)
  return d.toISOString().slice(0, 16)
}

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

function toggleMentionPopup() {
  rawToggleMention()
  showEmojiPopup.value = false
  showMfmMenu.value = false
}

function pickMention(user: Parameters<typeof rawPickMention>[0]) {
  rawPickMention(user, insertAtCursor, textareaRef)
}

// --- Emoji popup ---
const showEmojiPopup = ref(false)

function toggleEmojiPopup() {
  showEmojiPopup.value = !showEmojiPopup.value
  showMentionPopup.value = false
  showMfmMenu.value = false
}

function pickEmoji(reaction: string) {
  insertAtCursor(textareaRef.value, reaction)
  showEmojiPopup.value = false
}

// --- Hashtag ---
function insertHashtag() {
  insertAtCursor(textareaRef.value, '#')
}

// --- Plugin post_form_action ---
const postFormActions = computed(() => getPluginHandlers('post_form_action'))

function runPostFormAction(
  action: ReturnType<typeof getPluginHandlers>[number],
) {
  if (!activeAccountId.value) return
  setPluginAccountContext(action.pluginInstallId, activeAccountId.value)
  const form = { text: text.value, cw: cw.value }
  action.handler(form, (key: unknown, value: unknown) => {
    if (key === 'text' && typeof value === 'string') text.value = value
    if (key === 'cw' && typeof value === 'string') cw.value = value
  })
}

// --- MFM menu ---
const {
  showMfmMenu,
  mfmFunctions,
  toggleMfmMenu: rawToggleMfm,
  pickMfm,
} = useMfmInsert(textareaRef, text)

function toggleMfmMenu() {
  rawToggleMfm()
  showMentionPopup.value = false
  showEmojiPopup.value = false
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
const showAttachMenu = ref(false)
const showDrivePicker = ref(false)

function toggleAttachMenu() {
  showAttachMenu.value = !showAttachMenu.value
  showMentionPopup.value = false
  showEmojiPopup.value = false
  showMfmMenu.value = false
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
  showMoreMenu.value = !showMoreMenu.value
  showSchedulePopup.value = false
  showDraftMenu.value = false
}

function closePopups() {
  showMentionPopup.value = false
  showEmojiPopup.value = false
  showMfmMenu.value = false
  showSchedulePopup.value = false
  showDraftMenu.value = false
  showMoreMenu.value = false
  showAttachMenu.value = false
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
  <div :class="inline ? 'post-inline-wrapper' : 'post-overlay'" @click="!inline && emit('close')">
    <div class="post-form" :class="{ 'post-form--inline': inline }" :style="formThemeVars" @click.stop="closePopups">
      <!-- Header -->
      <header class="header">
        <div v-if="!inline" class="header-left">
          <button class="_button header-btn" title="閉じる" @click="emit('close')">
            <i class="ti ti-x" />
          </button>
          <div v-if="account" class="account-wrapper">
            <button
              class="_button account-btn"
              :title="`@${account.username}@${account.host}`"
              @click="showAccountMenu = !showAccountMenu"
            >
              <img
                v-if="account.avatarUrl"
                :src="account.avatarUrl"
                class="account-avatar"
              />
            </button>
            <div v-if="showAccountMenu && accounts.length > 1" class="account-menu">
              <button
                v-for="acc in accounts"
                :key="acc.id"
                class="_button account-option"
                :class="{ active: acc.id === activeAccountId }"
                @click="switchAccount(acc.id)"
              >
                <img
                  v-if="acc.avatarUrl"
                  :src="acc.avatarUrl"
                  class="account-option-avatar"
                />
                <div class="account-option-info">
                  <span class="account-option-name">{{ acc.username }}</span>
                  <span class="account-option-host">@{{ acc.host }}</span>
                </div>
              </button>
            </div>
          </div>
        </div>
        <div v-else class="header-left" />
        <div class="header-right">
          <!-- Note mode flags -->
          <button
            v-for="(val, key) in noteModeFlags"
            :key="key"
            class="_button header-btn note-mode-btn"
            :class="{ active: val }"
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
          <div v-if="!inline" class="visibility-wrapper">
            <button
              class="_button header-btn"
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
              <span class="header-btn-text">{{ currentVisibility.label }}</span>
            </button>
            <div v-if="showVisibilityMenu" class="visibility-menu">
              <button
                v-for="opt in visibilityOptions"
                :key="opt.value"
                class="_button visibility-option"
                :class="{ active: visibility === opt.value }"
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
            class="_button header-btn local-only-btn"
            :class="{ active: localOnly }"
            :title="localOnly ? 'ローカルのみ (連合なし)' : '連合あり'"
            @click="localOnly = !localOnly"
          >
            <i :class="localOnly ? 'ti ti-rocket-off' : 'ti ti-rocket'" />
          </button>

          <!-- More menu (preview, drafts, schedule) -->
          <div class="more-menu-wrapper">
            <button
              class="_button header-btn"
              title="その他"
              @click.stop="toggleMoreMenu"
            >
              <i class="ti ti-dots" />
            </button>
            <div v-if="showMoreMenu" class="more-menu" @click.stop>
              <!-- Preview -->
              <button
                class="_button more-menu-item"
                :class="{ active: showPreview }"
                @click="showPreview = !showPreview; showMoreMenu = false"
              >
                <i class="ti ti-eye" />
                プレビュー
              </button>
              <!-- Draft save -->
              <button
                class="_button more-menu-item"
                @click="saveCurrentDraft(); showMoreMenu = false"
              >
                <i class="ti ti-device-floppy" />
                下書きを保存
              </button>
              <!-- Draft list -->
              <button
                class="_button more-menu-item"
                :class="{ active: showDraftMenu }"
                @click.stop="showDraftMenu = !showDraftMenu"
              >
                <i class="ti ti-notes" />
                下書き
                <span v-if="drafts.length > 0" class="more-menu-badge">{{ drafts.length }}</span>
              </button>
              <!-- Draft list popup (nested) -->
              <div v-if="showDraftMenu" class="more-menu-draft-list">
                <div
                  v-for="d in drafts"
                  :key="d.id"
                  class="draft-item"
                >
                  <button class="_button draft-item-main" @click="restoreDraft(d); showMoreMenu = false">
                    <span class="draft-item-text">{{ d.text || '(空)' }}</span>
                    <span class="draft-item-date">{{ new Date(d.savedAt).toLocaleDateString() }}</span>
                  </button>
                  <button
                    class="_button draft-item-delete"
                    title="下書きを削除"
                    @click.stop="removeDraft(d.id)"
                  >
                    <i class="ti ti-x" />
                  </button>
                </div>
                <div v-if="drafts.length === 0" class="draft-empty">下書きはありません</div>
              </div>
              <!-- Schedule (only if server supports it) -->
              <template v-if="supportsScheduledNotes && !editNote">
                <div class="more-menu-divider" />
                <button
                  class="_button more-menu-item"
                  :class="{ active: !!scheduledAt }"
                  @click.stop="showSchedulePopup = !showSchedulePopup"
                >
                  <i class="ti ti-clock" />
                  予約投稿
                  <span v-if="scheduledAt" class="more-menu-schedule-badge">{{ formatScheduledDate(scheduledAt) }}</span>
                </button>
                <div v-if="showSchedulePopup" class="more-menu-schedule-picker" @click.stop>
                  <input
                    type="datetime-local"
                    class="schedule-datetime-input"
                    :min="minScheduleDatetime()"
                    :value="scheduledAt ? scheduledAt.slice(0, 16) : ''"
                    @change="setSchedule(($event.target as HTMLInputElement).value || null)"
                  />
                  <button
                    v-if="scheduledAt"
                    class="_button schedule-clear-btn"
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
            class="submit-btn"
            :class="{ posted, scheduled: !!scheduledAt }"
            :disabled="!canPost"
            @click="post"
          >
            <template v-if="posted">
              <svg viewBox="0 0 24 24" width="16" height="16">
                <path d="M20 6L9 17l-5-5" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" fill="none" />
              </svg>
            </template>
            <template v-else-if="isPosting">
              <span class="posting-dots">...</span>
            </template>
            <template v-else-if="scheduledAt">
              <svg viewBox="0 0 24 24" width="16" height="16" class="submit-icon">
                <circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="2" fill="none" />
                <path d="M12 6v6l4 2" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" fill="none" />
              </svg>
              予約投稿
            </template>
            <template v-else>
              <svg viewBox="0 0 24 24" width="16" height="16" class="submit-icon">
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
      <div v-if="replyTo" class="reply-preview">
        <img
          v-if="replyTo.user.avatarUrl"
          :src="replyTo.user.avatarUrl"
          class="reply-avatar"
        />
        <div class="reply-content">
          <span class="reply-user">
            <MkMfm v-if="replyTo.user.name" :text="replyTo.user.name" :emojis="replyTo.user.emojis" :server-host="replyTo._serverHost" />
            <template v-else>{{ replyTo.user.username }}</template>
          </span>
          <span class="reply-handle">@{{ replyTo.user.username }}</span>
          <p class="reply-text">{{ replyTo.text }}</p>
        </div>
      </div>

      <!-- Quote indicator -->
      <div v-if="renoteId && !replyTo" class="quote-indicator">
        <svg viewBox="0 0 24 24" width="14" height="14">
          <path d="M10 11h6m-3-3v6M3 8V6a2 2 0 012-2h14a2 2 0 012 2v12a2 2 0 01-2 2H5a2 2 0 01-2-2v-2" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" fill="none" />
        </svg>
        引用付き
      </div>

      <!-- Schedule indicator -->
      <div v-if="scheduledAt" class="schedule-indicator">
        <svg viewBox="0 0 24 24" width="14" height="14">
          <circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="2" fill="none" />
          <path d="M12 6v6l4 2" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" fill="none" />
        </svg>
        {{ formatScheduledDate(scheduledAt) }}
        <button class="_button schedule-clear" @click="scheduledAt = null">
          <i class="ti ti-x" />
        </button>
      </div>

      <!-- CW input -->
      <div v-if="showCw" class="cw-outer">
        <input
          v-model="cw"
          class="cw-input"
          placeholder="閲覧注意"
        />
      </div>

      <!-- Textarea -->
      <div class="text-outer" :class="{ withCw: showCw }">
        <textarea
          ref="textareaRef"
          v-model="text"
          class="text-area"
          :maxlength="MAX_TEXT_LENGTH"
          :placeholder="replyTo ? '返信...' : renoteId ? '引用...' : '今どんな気分？'"
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
          class="text-count _acrylic"
          :class="{ over: remainingChars < 0 }"
        >{{ remainingChars }}</span>
      </div>

      <!-- Preview -->
      <div v-if="showPreview" class="preview-section">
        <div class="preview-header">
          <i class="ti ti-eye" />
          プレビュー
        </div>
        <div class="preview-area">
          <div v-if="text" class="preview-content">
            <MkMfm
              :text="text"
              :emojis="{}"
              :server-host="account?.host"
              :account-id="activeAccountId"
            />
          </div>
          <div v-else class="preview-empty">テキストを入力するとプレビューが表示されます</div>
        </div>
        <div v-if="attachedFiles.length > 0" class="preview-files">
          <MkMediaGrid :files="attachedFiles" />
        </div>
      </div>

      <!-- Poll editor -->
      <div v-if="showPoll" class="poll-editor">
        <div v-for="(_, i) in pollChoices" :key="i" class="poll-choice-row">
          <input
            v-model="pollChoices[i]"
            class="poll-choice-input"
            :placeholder="`選択肢 ${i + 1}`"
          />
          <button
            v-if="pollChoices.length > 2"
            class="_button poll-choice-remove"
            @click="removePollChoice(i)"
          >
            <i class="ti ti-x" />
          </button>
        </div>
        <div class="poll-actions">
          <button
            v-if="pollChoices.length < 10"
            class="_button poll-add-btn"
            @click="addPollChoice"
          >
            <i class="ti ti-plus" /> 選択肢を追加
          </button>
          <label class="poll-multiple-label">
            <input v-model="pollMultiple" type="checkbox" />
            複数選択
          </label>
        </div>
      </div>

      <!-- File previews -->
      <div v-if="attachedFiles.length > 0 || isUploading" class="file-preview-area">
        <div v-for="file in attachedFiles" :key="file.id" class="file-preview">
          <img
            v-if="file.thumbnailUrl || file.type.startsWith('image/')"
            :src="file.thumbnailUrl || file.url"
            class="file-thumb"
          />
          <div v-else class="file-icon">
            <i class="ti ti-file-text" />
          </div>
          <button class="_button file-remove" title="削除" @click="removeFile(file.id)">
            <i class="ti ti-x" />
          </button>
        </div>
        <div v-if="isUploading" class="file-uploading">アップロード中...</div>
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
      <div v-if="error" class="post-error">{{ error }}</div>

      <!-- Footer -->
      <footer class="footer">
        <div class="footer-left">
          <!-- Attach file -->
          <div class="footer-popup-wrapper">
            <button
              class="_button footer-btn"
              title="ファイルを添付"
              :disabled="isUploading"
              @click.stop="toggleAttachMenu"
            >
              <i class="ti ti-photo-plus" />
            </button>
            <div v-if="showAttachMenu" class="footer-popup attach-menu" @click.stop>
              <button class="_button attach-menu-item" @click="attachFromLocal">
                <i class="ti ti-upload" />
                <span>アップロード</span>
              </button>
              <button class="_button attach-menu-item" @click="attachFromDrive">
                <i class="ti ti-cloud" />
                <span>ドライブから</span>
              </button>
            </div>
          </div>

          <!-- Poll -->
          <button
            class="_button footer-btn"
            :class="{ active: showPoll }"
            title="投票"
            @click="showPoll = !showPoll"
          >
            <i class="ti ti-chart-arrows" />
          </button>

          <!-- CW -->
          <button
            class="_button footer-btn"
            :class="{ active: showCw }"
            title="閲覧注意"
            @click="showCw = !showCw"
          >
            <i class="ti ti-eye-off" />
          </button>

          <!-- Hashtag -->
          <button class="_button footer-btn" title="ハッシュタグ" @click="insertHashtag">
            <i class="ti ti-hash" />
          </button>

          <!-- Mention -->
          <div class="footer-popup-wrapper">
            <button class="_button footer-btn" title="メンション" @click.stop="toggleMentionPopup">
              <i class="ti ti-at" />
            </button>
            <div v-if="showMentionPopup" class="footer-popup mention-popup" @click.stop>
              <input
                v-model="mentionQuery"
                class="mention-search-input"
                type="text"
                placeholder="ユーザーを検索..."
                @input="onMentionInput"
              />
              <div class="mention-results">
                <button
                  v-for="user in mentionResults"
                  :key="user.id"
                  class="_button mention-result-item"
                  @click="pickMention(user)"
                >
                  <img v-if="user.avatarUrl" :src="user.avatarUrl" class="mention-avatar" />
                  <div class="mention-info">
                    <span class="mention-name">{{ user.username }}</span>
                    <span v-if="user.host" class="mention-host">@{{ user.host }}</span>
                  </div>
                </button>
                <div v-if="mentionSearching" class="mention-status">検索中...</div>
                <div v-else-if="mentionQuery && mentionResults.length === 0" class="mention-status">
                  ユーザーが見つかりません
                </div>
              </div>
            </div>
          </div>

          <!-- MFM -->
          <div class="footer-popup-wrapper">
            <button class="_button footer-btn" title="MFM" @click.stop="toggleMfmMenu">
              <i class="ti ti-palette" />
            </button>
            <div v-if="showMfmMenu" class="footer-popup mfm-menu" @click.stop>
              <button
                v-for="fn in mfmFunctions"
                :key="fn.label"
                class="_button mfm-menu-item"
                @click="pickMfm(fn)"
              >
                {{ fn.label }}
              </button>
            </div>
          </div>

          <!-- Clear -->
          <button
            class="_button footer-btn"
            title="クリア"
            @click="resetForm"
          >
            <i class="ti ti-trash" />
          </button>

          <!-- Plugin actions -->
          <button
            v-for="action in postFormActions"
            :key="action.pluginInstallId + action.title"
            class="_button footer-btn"
            :title="action.title"
            @click="runPostFormAction(action)"
          >
            <i class="ti ti-plug" />
          </button>
        </div>
        <div class="footer-right">
          <!-- Emoji -->
          <div class="footer-popup-wrapper">
            <button class="_button footer-btn" title="絵文字" @click.stop="toggleEmojiPopup">
              <i class="ti ti-mood-happy" />
            </button>
            <div v-if="showEmojiPopup && account" class="footer-popup emoji-popup" @click.stop>
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

<style scoped>
.post-overlay {
  position: fixed;
  inset: 0;
  z-index: var(--nd-z-navbar);
  display: flex;
  flex-direction: column;
  align-items: center;
  padding-top: 12vh;
  background: var(--nd-modalBg);
  overflow-y: auto;
}

.post-inline-wrapper {
  display: contents;
}

.post-form {
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
}

/* ── Inline mode ── */
.post-form--inline {
  background: transparent;
  border-radius: 0;
  box-shadow: none;
  max-width: none;
  margin: 0;
  border-bottom: 1px solid var(--nd-divider);
}

.post-form--inline .header {
  min-height: 36px;
}

.post-form--inline .header-right {
  min-height: 36px;
  font-size: 0.85em;
}

.post-form--inline .header-btn {
  padding: 5px;
}

.post-form--inline .header-btn-text {
  display: none;
}

.post-form--inline .text-area {
  min-height: 42px;
  padding: 0 12px;
  font-size: 0.95em;
  field-sizing: content;
}

.post-form--inline .cw-input {
  padding: 6px 12px;
  font-size: 0.95em;
}

.post-form--inline .text-area::placeholder,
.post-form--inline .cw-input::placeholder {
  font-size: 1em;
}

.post-form--inline .footer {
  padding: 0 6px 6px;
  font-size: 0.9em;
}

.post-form--inline .footer-left {
  grid-template-columns: repeat(auto-fill, minmax(34px, 1fr));
  grid-auto-rows: 32px;
}

.post-form--inline .footer-right {
  grid-template-columns: repeat(auto-fill, minmax(34px, 1fr));
  grid-auto-rows: 32px;
}

.post-form--inline .submit-btn {
  margin: 6px 6px 6px 4px;
  padding: 0 10px;
  line-height: 30px;
  font-size: 0.85em;
  min-width: 70px;
}

.post-form--inline .file-preview-area {
  padding: 6px 12px;
}

.post-form--inline .file-preview {
  width: 60px;
  height: 60px;
}

.post-form--inline .poll-editor {
  padding: 6px 12px;
}

.post-form--inline .reply-preview {
  padding: 8px 12px;
  font-size: 0.85em;
}

.post-form--inline .post-error {
  padding: 4px 12px;
  font-size: 0.8em;
}

/* ── Header ── */
.header {
  display: flex;
  flex-wrap: nowrap;
  align-items: center;
  min-height: 50px;
  gap: 4px;
}

.header-left {
  display: flex;
  flex: 1;
  flex-wrap: nowrap;
  align-items: center;
  gap: 6px;
  padding-left: 12px;
}

.header-right {
  display: flex;
  min-height: 48px;
  font-size: 0.9em;
  flex-wrap: nowrap;
  align-items: center;
  margin-left: auto;
  gap: 4px;
  padding-left: 4px;
}

.header-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px;
  min-height: 44px;
  min-width: 44px;
  margin: 0;
  border-radius: 6px;
  color: var(--nd-fg);
  transition: background 0.15s;
}

.header-btn:hover {
  background: light-dark(rgba(0, 0, 0, 0.05), rgba(255, 255, 255, 0.05));
}

.header-btn-text {
  padding-left: 6px;
  overflow: clip;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 210px;
}

.account-wrapper {
  position: relative;
}

.account-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 8px;
  border-radius: 6px;
  transition: background 0.15s;
}

.account-btn:hover {
  background: light-dark(rgba(0, 0, 0, 0.05), rgba(255, 255, 255, 0.05));
}

.account-avatar {
  width: 28px;
  height: 28px;
  border-radius: 100%;
  object-fit: cover;
}

/* Account menu */
.account-menu {
  position: absolute;
  top: 100%;
  left: 0;
  z-index: 10;
  min-width: 200px;
  padding: 4px;
  margin-top: 4px;
  background: color-mix(in srgb, var(--nd-popup) 85%, transparent);
  border-radius: 12px;
  box-shadow: var(--nd-shadow-m);
  backdrop-filter: blur(16px);
}

.account-option {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 8px 12px;
  border-radius: 6px;
  color: var(--nd-fg);
  transition: background 0.15s;
}

.account-option:hover {
  background: light-dark(rgba(0, 0, 0, 0.05), rgba(255, 255, 255, 0.05));
}

.account-option.active {
  color: var(--nd-accent);
}

.account-option-avatar {
  width: 24px;
  height: 24px;
  border-radius: 100%;
  object-fit: cover;
  flex-shrink: 0;
}

.account-option-info {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.account-option-name {
  font-size: 0.85em;
  font-weight: bold;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.account-option-host {
  font-size: 0.75em;
  opacity: 0.6;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* Submit button (Misskey gradient style) */
.submit-btn {
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
  border-radius: 6px;
  min-width: 90px;
  color: var(--nd-fgOnAccent);
  background: linear-gradient(90deg, var(--nd-buttonGradateA, var(--nd-accent)), var(--nd-buttonGradateB, var(--nd-accent)));
  cursor: pointer;
  transition: opacity 0.15s, box-shadow 0.2s ease;
}

.submit-btn:hover:not(:disabled) {
  opacity: 0.85;
  box-shadow: 0 4px 12px color-mix(in srgb, var(--nd-accent) 40%, transparent);
}

.submit-btn:disabled {
  opacity: 0.7;
  cursor: not-allowed;
}

.submit-btn.posted {
  background: var(--nd-success);
}

.posting-dots {
  letter-spacing: 2px;
}

.submit-icon {
  flex-shrink: 0;
}

/* ── Visibility menu ── */
.visibility-wrapper {
  position: relative;
}

.visibility-menu {
  position: absolute;
  top: 100%;
  right: 0;
  z-index: 10;
  min-width: 160px;
  padding: 4px;
  margin-top: 4px;
  background: color-mix(in srgb, var(--nd-popup) 85%, transparent);
  border-radius: 12px;
  box-shadow: var(--nd-shadow-m);
  backdrop-filter: blur(16px);
}

.visibility-option {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 8px 12px;
  font-size: 0.85em;
  border-radius: 6px;
  color: var(--nd-fg);
  transition: background 0.15s;
}

.visibility-option:hover {
  background: light-dark(rgba(0, 0, 0, 0.05), rgba(255, 255, 255, 0.05));
}

.visibility-option.active {
  color: var(--nd-accent);
  font-weight: bold;
}

.visibility-option:disabled {
  opacity: 0.35;
  cursor: not-allowed;
}

/* ── Local only button ── */
.local-only-btn.active {
  color: var(--nd-error);
}

/* ── More menu ── */
.more-menu-wrapper {
  position: relative;
}

.more-menu {
  position: absolute;
  top: 100%;
  right: 0;
  z-index: 10;
  min-width: 200px;
  padding: 4px;
  margin-top: 4px;
  background: color-mix(in srgb, var(--nd-popup) 85%, transparent);
  border-radius: 12px;
  box-shadow: var(--nd-shadow-m);
  backdrop-filter: blur(16px);
}

.more-menu-item {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 8px 12px;
  font-size: 0.85em;
  border-radius: 6px;
  color: var(--nd-fg);
  transition: background 0.15s;
}

.more-menu-item:hover {
  background: light-dark(rgba(0, 0, 0, 0.05), rgba(255, 255, 255, 0.05));
}

.more-menu-item.active {
  color: var(--nd-accent);
}

.more-menu-badge {
  margin-left: auto;
  font-size: 0.75em;
  padding: 1px 6px;
  border-radius: 10px;
  background: var(--nd-accent);
  color: var(--nd-fgOnAccent);
}

.more-menu-divider {
  height: 1px;
  margin: 2px 8px;
  background: var(--nd-divider);
}

.more-menu-schedule-badge {
  margin-left: auto;
  font-size: 0.75em;
  opacity: 0.7;
}

.more-menu-draft-list {
  max-height: 200px;
  overflow-y: auto;
  padding: 0 4px 4px;
  scrollbar-width: none;
}

.more-menu-schedule-picker {
  padding: 8px 12px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

/* ── Note mode button ── */
.note-mode-btn.active {
  color: var(--nd-accent);
}

/* ── Reply preview ── */
.reply-preview {
  display: flex;
  padding: 12px 20px 16px;
  font-size: 0.95em;
  gap: 10px;
}

.reply-avatar {
  width: 36px;
  height: 36px;
  border-radius: 100%;
  object-fit: cover;
  flex-shrink: 0;
}

.reply-content {
  min-width: 0;
  max-height: 100px;
  overflow-y: auto;
}

.reply-user {
  font-weight: bold;
  font-size: 0.9em;
  color: var(--nd-fgHighlighted);
}

.reply-handle {
  font-size: 0.8em;
  opacity: 0.5;
  margin-left: 4px;
}

.reply-text {
  margin: 4px 0 0;
  white-space: pre-wrap;
  word-break: break-word;
  line-height: 1.4;
  color: var(--nd-fg);
  opacity: 0.8;
}

/* ── Quote indicator ── */
.quote-indicator {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 24px;
  font-size: 0.85em;
  color: var(--nd-accent);
}

/* ── CW input ── */
.cw-outer {
  width: 100%;
}

.cw-input {
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
.text-outer {
  width: 100%;
  position: relative;
}

.text-outer.withCw {
  padding-top: 8px;
}

.text-area {
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

.text-area::placeholder,
.cw-input::placeholder {
  color: var(--nd-fg);
  opacity: 0.35;
}

/* ── Preview ── */
.preview-section {
  border-top: 1px solid color-mix(in srgb, var(--nd-fg) 12%, transparent);
}

.preview-header {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 24px;
  font-size: 0.8em;
  color: var(--nd-fg);
  opacity: 0.5;
}

.preview-area {
  padding: 0 24px;
  max-height: 300px;
  overflow-y: auto;
  line-height: 1.5;
  font-size: 110%;
  scrollbar-width: thin;
}

.preview-content {
  word-break: break-word;
  overflow-wrap: break-word;
}

.preview-empty {
  padding: 16px 0;
  text-align: center;
  color: var(--nd-fg);
  opacity: 0.35;
  font-size: 0.9em;
}

.preview-files {
  padding: 8px 24px;
}

/* ── Error ── */
.post-error {
  padding: 8px 24px;
  color: var(--nd-error);
  font-size: 0.85em;
}

/* ── Text count (overlaid on textarea) ── */
.text-count {
  position: absolute;
  top: 0;
  right: 2px;
  padding: 4px 6px;
  font-size: 0.9em;
  color: var(--nd-warn, #ecb637);
  border-radius: 6px;
  min-width: 1.6em;
  text-align: center;
}

.text-count.over {
  color: var(--nd-error);
}

._acrylic {
  background: color-mix(in srgb, var(--nd-panelBg, var(--nd-popup)) 50%, transparent);
  backdrop-filter: blur(15px);
  -webkit-backdrop-filter: blur(15px);
}

/* ── Poll editor ── */
.poll-editor {
  padding: 8px 24px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.poll-choice-row {
  display: flex;
  align-items: center;
  gap: 4px;
}

.poll-choice-input {
  flex: 1;
  padding: 6px 10px;
  font-size: 0.9em;
  font-family: inherit;
  color: var(--nd-fg);
  background: var(--nd-buttonBg);
  border: none;
  border-radius: 6px;
  outline: none;
}

.poll-choice-input::placeholder {
  color: var(--nd-fg);
  opacity: 0.35;
}

.poll-choice-remove {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border-radius: 6px;
  color: var(--nd-fg);
  opacity: 0.5;
  flex-shrink: 0;
}

.poll-choice-remove:hover {
  opacity: 1;
  background: light-dark(rgba(0, 0, 0, 0.05), rgba(255, 255, 255, 0.05));
}

.poll-actions {
  display: flex;
  align-items: center;
  gap: 12px;
  padding-top: 2px;
}

.poll-add-btn {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 4px 8px;
  font-size: 0.8em;
  color: var(--nd-accent);
  border-radius: 6px;
}

.poll-add-btn:hover {
  background: light-dark(rgba(0, 0, 0, 0.05), rgba(255, 255, 255, 0.05));
}

.poll-multiple-label {
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
  padding: 0 16px 16px;
  font-size: 1em;
}

.footer-left {
  flex: 1;
  display: grid;
  grid-auto-flow: row;
  grid-template-columns: repeat(auto-fill, minmax(42px, 1fr));
  grid-auto-rows: 40px;
}

.footer-right {
  flex: 0;
  margin-left: auto;
  display: grid;
  grid-auto-flow: row;
  grid-template-columns: repeat(auto-fill, minmax(42px, 1fr));
  grid-auto-rows: 40px;
  direction: rtl;
}

.footer-popup-wrapper {
  position: relative;
}

.footer-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  margin: 0;
  font-size: 1em;
  width: 100%;
  height: 100%;
  border-radius: 6px;
  color: var(--nd-fg);
  transition: background 0.15s, color 0.15s;
}

.footer-btn:hover {
  background: light-dark(rgba(0, 0, 0, 0.05), rgba(255, 255, 255, 0.05));
}

.footer-btn.active {
  color: var(--nd-accent);
}

/* ── Footer popups (shared) ── */
.footer-popup {
  position: absolute;
  top: 100%;
  left: 50%;
  transform: translateX(-50%);
  z-index: 20;
  margin-top: 8px;
  background: color-mix(in srgb, var(--nd-popup) 85%, transparent);
  border-radius: 12px;
  box-shadow: var(--nd-shadow-m);
  backdrop-filter: blur(16px);
}

/* ── Mention popup ── */
.mention-popup {
  width: 260px;
  max-height: 300px;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.mention-search-input {
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

.mention-results {
  flex: 1;
  overflow-y: auto;
  padding: 4px;
  scrollbar-width: none;
}

.mention-result-item {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 8px;
  border-radius: 6px;
  color: var(--nd-fg);
  transition: background 0.15s;
}

.mention-result-item:hover {
  background: light-dark(rgba(0, 0, 0, 0.05), rgba(255, 255, 255, 0.05));
}

.mention-avatar {
  width: 28px;
  height: 28px;
  border-radius: 100%;
  object-fit: cover;
  flex-shrink: 0;
}

.mention-info {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.mention-name {
  font-size: 0.85em;
  font-weight: bold;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.mention-host {
  font-size: 0.75em;
  opacity: 0.6;
}

.mention-status {
  padding: 12px;
  text-align: center;
  font-size: 0.8em;
  opacity: 0.5;
}

/* ── Emoji popup ── */
.emoji-popup {
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
.mfm-menu {
  width: 160px;
  max-height: 320px;
  overflow-y: auto;
  padding: 4px;
  scrollbar-width: none;
}

.mfm-menu-item {
  display: block;
  width: 100%;
  padding: 6px 10px;
  font-size: 0.82em;
  text-align: left;
  border-radius: 6px;
  color: var(--nd-fg);
  transition: background 0.15s;
}

.mfm-menu-item:hover {
  background: light-dark(rgba(0, 0, 0, 0.05), rgba(255, 255, 255, 0.05));
}

/* ── File preview ── */
.file-preview-area {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  padding: 8px 24px;
}

.file-preview {
  position: relative;
  width: 80px;
  height: 80px;
  border-radius: 8px;
  overflow: hidden;
  background: var(--nd-buttonBg);
}

.file-thumb {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.file-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
  color: var(--nd-fg);
  opacity: 0.5;
}

.file-remove {
  position: absolute;
  top: 0;
  right: 0;
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  background: rgba(0, 0, 0, 0.6);
  color: #fff;
  cursor: pointer;
}

.file-uploading {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 80px;
  height: 80px;
  border-radius: 8px;
  background: var(--nd-buttonBg);
  font-size: 0.7em;
  opacity: 0.6;
}

/* ── Schedule indicator ── */
.schedule-indicator {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 24px;
  font-size: 0.82em;
  color: var(--nd-accent);
}

.schedule-clear {
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
}

.schedule-clear:hover {
  opacity: 1;
  background: light-dark(rgba(0, 0, 0, 0.05), rgba(255, 255, 255, 0.05));
}

.submit-btn.scheduled {
  background: var(--nd-accent);
}

/* ── Draft menu ── */
.draft-menu {
  width: 280px;
  max-height: 360px;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.draft-menu-item {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 10px 12px;
  font-size: 0.85em;
  color: var(--nd-fg);
  border-radius: 6px;
  transition: background 0.15s;
}

.draft-menu-item:hover {
  background: light-dark(rgba(0, 0, 0, 0.05), rgba(255, 255, 255, 0.05));
}

.draft-save {
  color: var(--nd-accent);
  font-weight: bold;
}

.draft-divider {
  height: 1px;
  margin: 2px 8px;
  background: var(--nd-divider);
}

.draft-list {
  flex: 1;
  overflow-y: auto;
  padding: 4px;
  scrollbar-width: none;
}

.draft-item {
  display: flex;
  align-items: center;
  border-radius: 6px;
  transition: background 0.15s;
}

.draft-item:hover {
  background: light-dark(rgba(0, 0, 0, 0.05), rgba(255, 255, 255, 0.05));
}

.draft-item-main {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 8px;
  min-width: 0;
  text-align: left;
  color: var(--nd-fg);
}

.draft-item-text {
  font-size: 0.82em;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.draft-item-date {
  font-size: 0.72em;
  opacity: 0.5;
}

.draft-item-delete {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  flex-shrink: 0;
  border-radius: 6px;
  color: var(--nd-fg);
  opacity: 0.4;
}

.draft-item-delete:hover {
  opacity: 1;
  background: light-dark(rgba(0, 0, 0, 0.05), rgba(255, 255, 255, 0.05));
}

.draft-empty {
  padding: 16px;
  text-align: center;
  font-size: 0.8em;
  opacity: 0.5;
}

/* ── Schedule popup ── */
.schedule-popup {
  width: 240px;
  padding: 12px;
}

.schedule-popup-content {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.schedule-datetime-input {
  width: 100%;
  padding: 8px;
  font-size: 0.85em;
  font-family: inherit;
  color: var(--nd-fg);
  background: var(--nd-buttonBg);
  border: none;
  border-radius: 6px;
  outline: none;
  box-sizing: border-box;
}

.schedule-clear-btn {
  padding: 6px;
  font-size: 0.8em;
  color: var(--nd-error);
  border-radius: 6px;
  text-align: center;
}

.schedule-clear-btn:hover {
  background: light-dark(rgba(0, 0, 0, 0.05), rgba(255, 255, 255, 0.05));
}

/* ── Responsive ── */
@container (max-width: 500px) {
  .header-btn-text {
    display: none;
  }

  .submit-btn {
    margin: 8px 8px 8px 4px;
    min-height: 44px;
  }

  .cw-input,
  .text-area {
    padding-left: 16px;
    padding-right: 16px;
  }

  .text-area {
    min-height: 80px;
  }

  .footer {
    padding: 0 8px 8px;
  }

  .footer-left,
  .footer-right {
    grid-auto-rows: 44px;
  }

  .poll-editor {
    padding: 8px 16px;
  }
}

@container (max-width: 350px) {
  .footer {
    font-size: 0.9em;
  }

  .footer-left {
    grid-template-columns: repeat(auto-fill, minmax(38px, 1fr));
  }

  .header-right {
    gap: 0;
  }
}

/* ── Attach menu ── */
.attach-menu {
  min-width: 200px;
  padding: 4px;
  left: 0;
  transform: none;
}

.attach-menu-item {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 8px 12px;
  font-size: 0.85em;
  color: var(--nd-fg);
  border-radius: 6px;
  transition: background 0.15s;
  text-align: left;
}

.attach-menu-item:hover {
  background: var(--nd-buttonHoverBg);
}

.attach-menu-item .ti {
  font-size: 16px;
  opacity: 0.7;
}


/* Mobile fullscreen */
@media (max-width: 600px) {
  .post-overlay {
    background: var(--nd-bg);
    padding-top: var(--nd-safe-area-top, env(safe-area-inset-top));
    padding-bottom: var(--nd-safe-area-bottom, env(safe-area-inset-bottom));
    align-items: stretch;
  }

  .post-form {
    max-width: none;
    margin: 0;
    border-radius: 0;
    height: 100%;
    max-height: none;
    box-shadow: none;
  }

  .emoji-popup {
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

/* Mobile platform: always fullscreen */
html.nd-mobile .post-overlay {
  background: var(--nd-bg);
  padding-top: var(--nd-safe-area-top, env(safe-area-inset-top));
  padding-bottom: var(--nd-safe-area-bottom, env(safe-area-inset-bottom));
  align-items: stretch;
}

html.nd-mobile .post-form {
  max-width: none;
  margin: 0;
  border-radius: 0;
  height: 100%;
  max-height: none;
  box-shadow: none;
}

html.nd-mobile .emoji-popup {
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
</style>
