<script setup lang="ts">
import { nextTick, onMounted, ref } from 'vue'
import type { NormalizedNote } from '@/adapters/types'
import { usePostFormState } from '@/composables/usePostFormState'
import MkMfm from './MkMfm.vue'

const props = defineProps<{
  accountId: string
  replyTo?: NormalizedNote
  renoteId?: string
  editNote?: NormalizedNote
}>()

const emit = defineEmits<{
  close: []
  posted: [editedNoteId?: string]
}>()

const textareaRef = ref<HTMLTextAreaElement | null>(null)
const fileInput = ref<HTMLInputElement | null>(null)

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
  initAdapter,
  switchAccount,
  post,
  openFilePicker,
  onFileSelected,
  removeFile,
  selectVisibility,
  noteModeLabel,
  noteModeIcon,
} = usePostFormState(props, { onPosted: (id) => emit('posted', id) }, fileInput)

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
  await nextTick()
  textareaRef.value?.focus()
})

function onKeydown(e: KeyboardEvent) {
  if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
    post()
  }
  if (e.key === 'Escape') {
    emit('close')
  }
}
</script>

<template>
  <div class="post-overlay" @click="emit('close')">
    <div class="post-form" :style="formThemeVars" @click.stop>
      <!-- Header -->
      <header class="header">
        <div class="header-left">
          <button class="_button header-btn" title="Close" @click="emit('close')">
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

          <!-- Visibility -->
          <div class="visibility-wrapper">
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

          <!-- Local only (Tabler Icons: ti-rocket / ti-rocket-off) -->
          <button
            v-if="visibility !== 'specified'"
            class="_button header-btn local-only-btn"
            :class="{ active: localOnly }"
            :title="localOnly ? 'Local only (連合なし)' : 'Federated (連合あり)'"
            @click="localOnly = !localOnly"
          >
            <svg viewBox="0 0 24 24" width="18" height="18"
              stroke="currentColor" stroke-width="2"
              stroke-linecap="round" stroke-linejoin="round" fill="none"
            >
              <path d="M4 13a8 8 0 0 1 7-7 4 4 0 0 0 6.243 6.243 8 8 0 0 1-7 7" />
              <path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z" />
              <path d="M15 9h.01" />
              <path v-if="localOnly" d="M3 3l18 18" />
            </svg>
          </button>

          <!-- Submit -->
          <button
            class="submit-btn"
            :class="{ posted }"
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
              {{ editNote ? 'Edit' : replyTo ? 'Reply' : renoteId ? 'Quote' : 'Note' }}
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
        Quote attached
      </div>

      <!-- CW input -->
      <div v-if="showCw" class="cw-outer">
        <input
          v-model="cw"
          class="cw-input"
          placeholder="Content Warning"
        />
      </div>

      <!-- Textarea -->
      <div class="text-outer" :class="{ withCw: showCw }">
        <textarea
          ref="textareaRef"
          v-model="text"
          class="text-area"
          :maxlength="MAX_TEXT_LENGTH"
          :placeholder="replyTo ? 'Reply...' : renoteId ? 'Quote...' : 'What\'s on your mind?'"
          @keydown="onKeydown"
        />
        <span
          v-if="remainingChars <= 100"
          class="text-count _acrylic"
          :class="{ over: remainingChars < 0 }"
        >{{ remainingChars }}</span>
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
          <button class="_button file-remove" title="Remove" @click="removeFile(file.id)">
            <i class="ti ti-x" />
          </button>
        </div>
        <div v-if="isUploading" class="file-uploading">Uploading...</div>
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
          <button
            class="_button footer-btn"
            title="Attach file"
            :disabled="isUploading"
            @click="openFilePicker"
          >
            <i class="ti ti-paperclip" />
          </button>
          <button
            class="_button footer-btn"
            :class="{ active: showCw }"
            title="Content Warning"
            @click="showCw = !showCw"
          >
            <i class="ti ti-eye-off" />
          </button>
        </div>
      </footer>
    </div>
  </div>
</template>

<style scoped>
.post-overlay {
  position: fixed;
  inset: 0;
  z-index: 2000;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--nd-modalBg);
}

.post-form {
  background: var(--nd-popup);
  border-radius: 16px;
  box-shadow: 0 8px 32px var(--nd-shadow);
  width: 100%;
  max-width: 520px;
  margin: 16px;
  overflow: clip;
  display: flex;
  flex-direction: column;
  container-type: inline-size;
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
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.15);
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
  transition: opacity 0.15s;
}

.submit-btn:hover:not(:disabled) {
  opacity: 0.85;
}

.submit-btn:disabled {
  opacity: 0.7;
  cursor: not-allowed;
}

.submit-btn.posted {
  background: #4caf50;
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
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.15);
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
  color: #ff2a2a;
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

/* ── Error ── */
.post-error {
  padding: 8px 24px;
  color: #ff2a2a;
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
  color: #ff2a2a;
}

._acrylic {
  background: color-mix(in srgb, var(--nd-panelBg, var(--nd-popup)) 50%, transparent);
  backdrop-filter: blur(15px);
  -webkit-backdrop-filter: blur(15px);
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

.footer-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  margin: 0;
  font-size: 1em;
  width: auto;
  height: 100%;
  border-radius: 6px;
  color: var(--nd-fg);
  opacity: 0.6;
  transition: opacity 0.15s, background 0.15s, color 0.15s;
}

.footer-btn:hover {
  opacity: 1;
  background: light-dark(rgba(0, 0, 0, 0.05), rgba(255, 255, 255, 0.05));
}

.footer-btn.active {
  opacity: 1;
  color: var(--nd-accent);
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
  top: 4px;
  right: 4px;
  width: 22px;
  height: 22px;
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

/* ── Responsive ── */
@container (max-width: 500px) {
  .header-btn-text {
    display: none;
  }

  .submit-btn {
    margin: 8px 8px 8px 4px;
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

/* Mobile fullscreen */
@media (max-width: 600px) {
  .post-overlay {
    background: none;
    padding-top: env(safe-area-inset-top);
    padding-bottom: env(safe-area-inset-bottom);
  }

  .post-form {
    max-width: none;
    margin: 0;
    border-radius: 0;
    height: 100%;
    max-height: none;
  }
}
</style>
