<script setup lang="ts">
import { invoke } from '@tauri-apps/api/core'
import { openUrl } from '@tauri-apps/plugin-opener'
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { MisskeyAuth } from '@/adapters/misskey/auth'
import type { AuthSession } from '@/adapters/types'
import { detectServer } from '@/core/server'
import type { Account } from '@/stores/accounts'
import { useAccountsStore } from '@/stores/accounts'
import { AppError } from '@/utils/errors'

const router = useRouter()
const accountsStore = useAccountsStore()
const auth = new MisskeyAuth()

const host = ref('')
const step = ref<'input' | 'waiting' | 'error'>('input')
const errorMessage = ref('')
let currentSession: AuthSession | null = null

async function startLogin() {
  const trimmedHost = host.value
    .trim()
    .replace(/^https?:\/\//, '')
    .replace(/\/$/, '')
  if (!trimmedHost) return

  try {
    step.value = 'waiting'
    currentSession = await auth.startAuth(trimmedHost)
    await openUrl(currentSession.url)
  } catch (e) {
    step.value = 'error'
    errorMessage.value = AppError.from(e).message
  }
}

async function completeLogin() {
  if (!currentSession) return

  try {
    const serverInfo = await detectServer(currentSession.host)
    const account = await invoke<Account>('auth_complete_and_save', {
      session: currentSession,
      software: serverInfo.software,
    })

    accountsStore.addAccount(account)
    router.push('/')
  } catch (e) {
    step.value = 'error'
    errorMessage.value = AppError.from(e).message
  }
}

function reset() {
  step.value = 'input'
  errorMessage.value = ''
  currentSession = null
}
</script>

<template>
  <div class="login-page">
    <div class="login-dialog">
      <div class="dialog-header">
        <h1 class="dialog-title">Add Account</h1>
      </div>

      <div class="dialog-body">
        <div v-if="step === 'input'" class="login-form">
          <div class="input-group">
            <label class="input-label" for="host">Server hostname</label>
            <div class="input-wrapper">
              <input
                id="host"
                v-model="host"
                type="text"
                class="mk-input"
                placeholder="example.com"
                @keyup.enter="startLogin"
              />
            </div>
          </div>

          <div class="dialog-actions">
            <button
              class="mk-btn mk-btn-primary"
              :disabled="!host.trim()"
              @click="startLogin"
            >
              Login with MiAuth
            </button>
            <router-link to="/" class="mk-btn mk-btn-secondary">
              Cancel
            </router-link>
          </div>
        </div>

        <div v-else-if="step === 'waiting'" class="login-waiting">
          <p class="waiting-text">Authenticate in the browser window that just opened.</p>
          <p class="waiting-text">After authorizing, click the button below.</p>

          <div class="dialog-actions">
            <button class="mk-btn mk-btn-primary" @click="completeLogin">
              I've authorized
            </button>
            <button class="mk-btn mk-btn-secondary" @click="reset">
              Cancel
            </button>
          </div>
        </div>

        <div v-else-if="step === 'error'" class="login-error">
          <p class="error-text">{{ errorMessage }}</p>

          <div class="dialog-actions">
            <button class="mk-btn mk-btn-primary" @click="reset">
              Try again
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.login-page {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 100%;
  background: var(--nd-bg);
}

.login-dialog {
  background: var(--nd-popup);
  border-radius: 16px;
  box-shadow: 0 8px 32px var(--nd-shadow);
  min-width: 320px;
  max-width: 480px;
  width: 100%;
  margin: 16px;
  overflow: clip;
}

.dialog-header {
  padding: 20px 32px 0;
}

.dialog-title {
  font-size: 1.1em;
  font-weight: bold;
  margin: 0;
  color: var(--nd-fgHighlighted);
}

.dialog-body {
  padding: 24px 32px 32px;
}

/* Input (Misskey MkInput style) */
.input-group {
  margin-bottom: 20px;
}

.input-label {
  display: block;
  font-size: 0.85em;
  font-weight: bold;
  padding: 0 0 8px 0;
  color: var(--nd-fg);
}

.mk-input {
  display: block;
  width: 100%;
  height: 36px;
  padding: 0 12px;
  font-size: 1em;
  font-family: inherit;
  color: var(--nd-fg);
  background: transparent;
  border: solid 1px var(--nd-panel);
  border-radius: 6px;
  outline: none;
  transition: border-color 0.1s;
}

.mk-input:hover {
  border-color: var(--nd-inputBorderHover);
}

.mk-input:focus {
  border-color: var(--nd-accent);
}

.mk-input::placeholder {
  color: var(--nd-fg);
  opacity: 0.35;
}

/* Buttons (Misskey MkButton style) */
.dialog-actions {
  display: flex;
  gap: 8px;
  justify-content: center;
}

.mk-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 7px 14px;
  font-size: 95%;
  font-family: inherit;
  font-weight: bold;
  border: none;
  border-radius: 5px;
  cursor: pointer;
  transition: background 0.1s;
  text-decoration: none;
  line-height: 1.35;
}

.mk-btn-primary {
  background: var(--nd-accent);
  color: var(--nd-fgOnAccent);
}

.mk-btn-primary:hover:not(:disabled) {
  background: hsl(from var(--nd-accent) h s calc(l + 5));
}

.mk-btn-primary:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.mk-btn-secondary {
  background: var(--nd-buttonBg);
  color: var(--nd-fg);
}

.mk-btn-secondary:hover {
  background: var(--nd-buttonHoverBg);
}

/* Content */
.waiting-text {
  margin: 0 0 8px;
  font-size: 0.9em;
  line-height: 1.5;
  color: var(--nd-fg);
}

.waiting-text:last-of-type {
  margin-bottom: 20px;
}

.error-text {
  margin: 0 0 20px;
  color: var(--nd-love);
  font-size: 0.9em;
}
</style>
