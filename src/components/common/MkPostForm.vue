<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { createAdapter } from '@/adapters/registry'
import type { NormalizedNote, ServerAdapter } from '@/adapters/types'
import { useAccountsStore } from '@/stores/accounts'
import { useServersStore } from '@/stores/servers'

const props = defineProps<{
  accountId: string
  replyTo?: NormalizedNote
  renoteId?: string
}>()

const emit = defineEmits<{
  close: []
  posted: []
}>()

const accountsStore = useAccountsStore()
const serversStore = useServersStore()

const text = ref('')
const cw = ref('')
const showCw = ref(false)
const visibility = ref<'public' | 'home' | 'followers' | 'specified'>('public')
const showVisibilityMenu = ref(false)
const isPosting = ref(false)
const posted = ref(false)
const error = ref<string | null>(null)

let adapter: ServerAdapter | null = null

const account = accountsStore.accounts.find((a) => a.id === props.accountId)

const visibilityOptions: { value: typeof visibility.value; label: string; icon: string }[] = [
  { value: 'public', label: 'Public', icon: 'M22 12A10 10 0 112 12a10 10 0 0120 0zM2 12h20M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10A15.3 15.3 0 0112 2z' },
  { value: 'home', label: 'Home', icon: 'M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 01-1-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 01-1 1m-2 0h2' },
  { value: 'followers', label: 'Followers', icon: 'M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z' },
  { value: 'specified', label: 'Direct', icon: 'M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0l-8.25 5.25a1.5 1.5 0 01-1.5 0L2.25 6.75' },
]

const currentVisibility = computed(() =>
  visibilityOptions.find((o) => o.value === visibility.value) || visibilityOptions[0],
)

const canPost = computed(() => {
  if (isPosting.value) return false
  if (props.renoteId) return true
  return text.value.trim().length > 0
})

onMounted(async () => {
  if (!account) return
  try {
    const serverInfo = await serversStore.getServerInfo(account.host)
    adapter = createAdapter(serverInfo, account.token, account.id)
  } catch {
    error.value = 'Failed to connect'
  }

  if (props.replyTo) {
    visibility.value = props.replyTo.visibility
  }
})

async function post() {
  if (!adapter || !canPost.value) return

  isPosting.value = true
  error.value = null

  try {
    await adapter.api.createNote({
      text: text.value || undefined,
      cw: showCw.value && cw.value ? cw.value : undefined,
      visibility: visibility.value,
      replyId: props.replyTo?.id,
      renoteId: props.renoteId,
    })
    posted.value = true
    setTimeout(() => emit('posted'), 500)
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Post failed'
  } finally {
    isPosting.value = false
  }
}

function selectVisibility(v: typeof visibility.value) {
  visibility.value = v
  showVisibilityMenu.value = false
}

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
    <div class="post-form" @click.stop>
      <!-- Header -->
      <header class="header">
        <div class="header-left">
          <button class="_button header-btn" title="Close" @click="emit('close')">
            <svg viewBox="0 0 24 24" width="18" height="18">
              <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
            </svg>
          </button>
          <button v-if="account" class="_button account-btn" :title="`@${account.username}@${account.host}`">
            <img
              v-if="account.avatarUrl"
              :src="account.avatarUrl"
              class="account-avatar"
            />
          </button>
        </div>
        <div class="header-right">
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
                <template v-if="replyTo">
                  <path d="M9 14L4 9l5-5M4 9h10.5a5.5 5.5 0 010 11H11" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" fill="none" />
                </template>
                <template v-else-if="renoteId">
                  <path d="M10 11h6m-3-3v6M3 8V6a2 2 0 012-2h14a2 2 0 012 2v12a2 2 0 01-2 2H5a2 2 0 01-2-2v-2" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" fill="none" />
                </template>
                <template v-else>
                  <path d="M22 2L11 13M22 2l-7 20-4-9-9-4z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" fill="none" />
                </template>
              </svg>
              {{ replyTo ? 'Reply' : renoteId ? 'Quote' : 'Note' }}
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
          <span class="reply-user">{{ replyTo.user.name || replyTo.user.username }}</span>
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
          v-model="text"
          class="text-area"
          :placeholder="replyTo ? 'Reply...' : renoteId ? 'Quote...' : 'What\'s on your mind?'"
          autofocus
          @keydown="onKeydown"
        />
      </div>

      <!-- Error -->
      <div v-if="error" class="post-error">{{ error }}</div>

      <!-- Footer -->
      <footer class="footer">
        <div class="footer-left">
          <button
            class="_button footer-btn"
            :class="{ active: showCw }"
            title="Content Warning"
            @click="showCw = !showCw"
          >
            <svg viewBox="0 0 24 24" width="18" height="18">
              <path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24M1 1l22 22" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" fill="none" />
            </svg>
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
  align-items: center;
  min-height: 50px;
  border-bottom: 0.5px solid var(--nd-divider);
}

.header-left {
  display: flex;
  align-items: center;
}

.header-right {
  display: flex;
  align-items: center;
  gap: 4px;
  margin-left: auto;
  padding-right: 12px;
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
  background: color-mix(in srgb, var(--nd-fg) 8%, transparent);
}

.header-btn-text {
  font-size: 0.85em;
  max-width: 120px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
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
  background: color-mix(in srgb, var(--nd-fg) 8%, transparent);
}

.account-avatar {
  width: 28px;
  height: 28px;
  border-radius: 100%;
  object-fit: cover;
}

/* Submit button (Misskey gradient style) */
.submit-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 0 12px;
  line-height: 34px;
  font-size: 0.9em;
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
  opacity: 0.5;
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
  background: var(--nd-popup);
  border-radius: 8px;
  box-shadow: 0 4px 16px var(--nd-shadow);
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
  background: color-mix(in srgb, var(--nd-fg) 8%, transparent);
}

.visibility-option.active {
  color: var(--nd-accent);
  font-weight: bold;
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
  resize: none;
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

/* ── Footer ── */
.footer {
  display: flex;
  padding: 0 16px 16px;
  font-size: 1em;
}

.footer-left {
  flex: 1;
  display: flex;
  align-items: center;
}

.footer-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  padding: 0;
  margin: 0;
  border-radius: 6px;
  color: var(--nd-fg);
  opacity: 0.6;
  transition: opacity 0.15s, background 0.15s, color 0.15s;
}

.footer-btn:hover {
  opacity: 1;
  background: color-mix(in srgb, var(--nd-fg) 8%, transparent);
}

.footer-btn.active {
  opacity: 1;
  color: var(--nd-accent);
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
}
</style>
