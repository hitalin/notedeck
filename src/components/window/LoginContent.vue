<script setup lang="ts">
import { invoke } from '@tauri-apps/api/core'
import { openUrl } from '@tauri-apps/plugin-opener'
import { ref } from 'vue'
import { MisskeyAuth } from '@/adapters/misskey/auth'
import type { AuthSession } from '@/adapters/types'
import { detectServer } from '@/core/server'
import type { Account } from '@/stores/accounts'
import { useAccountsStore } from '@/stores/accounts'
import { AppError } from '@/utils/errors'

const emit = defineEmits<{
  close: []
  success: []
}>()

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
    emit('success')
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
  <div class="login-content">
    <Transition name="step" mode="out-in">
      <!-- Step 1: Input -->
      <div v-if="step === 'input'" key="input" class="dialog-body">
        <div class="logo-area">
          <img src="/favicon.svg" alt="NoteDeck" class="app-logo" />
          <p class="subtitle">Misskeyサーバーに接続</p>
        </div>

        <div class="form-area">
          <label class="input-label" for="host">サーバーアドレス</label>
          <input
            id="host"
            v-model="host"
            type="text"
            class="mk-input"
            placeholder="misskey.io"
            autocomplete="off"
            @keyup.enter="startLogin"
          />
        </div>

        <div class="actions">
          <button
            class="btn-login"
            :disabled="!host.trim()"
            @click="startLogin"
          >
            ログイン
          </button>
          <button class="_button btn-cancel" @click="emit('close')">
            キャンセル
          </button>
        </div>
      </div>

      <!-- Step 2: Waiting -->
      <div v-else-if="step === 'waiting'" key="waiting" class="dialog-body">
        <div class="logo-area">
          <div class="waiting-spinner" />
          <p class="subtitle">認証待ち...</p>
        </div>

        <div class="waiting-info">
          <p>ブラウザで認証画面が開きました。</p>
          <p>認証が完了したら、下のボタンをクリックしてください。</p>
        </div>

        <div class="actions">
          <button class="btn-login" @click="completeLogin">
            認証しました
          </button>
          <button class="_button btn-cancel" @click="reset">
            キャンセル
          </button>
        </div>
      </div>

      <!-- Step 3: Error -->
      <div v-else-if="step === 'error'" key="error" class="dialog-body">
        <div class="logo-area">
          <div class="error-icon-wrap">
            <i class="ti ti-alert-triangle" />
          </div>
        </div>

        <p class="error-text">{{ errorMessage }}</p>

        <div class="actions">
          <button class="btn-login" @click="reset">
            やり直す
          </button>
        </div>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
.login-content {
  height: 100%;
  overflow-y: auto;
  display: flex;
  align-items: center;
  justify-content: center;
}

.dialog-body {
  padding: 32px;
}

/* Logo / visual area */
.logo-area {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  margin-bottom: 28px;
}

.app-logo {
  width: 48px;
  height: 48px;
  border-radius: 10px;
}

.subtitle {
  font-size: 0.85em;
  color: var(--nd-fg);
  opacity: 0.7;
}

/* Form */
.form-area {
  margin-bottom: 24px;
}

.input-label {
  display: block;
  font-size: 0.85em;
  font-weight: bold;
  padding: 0 0 8px 2px;
  color: var(--nd-fg);
}

.mk-input {
  display: block;
  width: 100%;
  height: 42px;
  padding: 0 14px;
  font-size: 1em;
  font-family: inherit;
  color: var(--nd-fg);
  background: transparent;
  border: solid 1px var(--nd-inputBorder, var(--nd-divider));
  border-radius: var(--nd-radius-md);
  outline: none;
  transition: border-color 0.15s;
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

/* Actions */
.actions {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
}

.btn-login {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 42px;
  padding: 0 20px;
  border: none;
  border-radius: var(--nd-radius-full);
  background: linear-gradient(90deg, var(--nd-buttonGradateA), var(--nd-buttonGradateB));
  color: var(--nd-fgOnAccent);
  font-size: 0.95em;
  font-weight: bold;
  font-family: inherit;
  cursor: pointer;
  transition: transform 0.15s, box-shadow 0.15s, opacity 0.15s;
}

.btn-login:hover:not(:disabled) {
  transform: scale(1.02);
  box-shadow: 0 4px 12px rgba(134, 179, 0, 0.3);
}

.btn-login:active:not(:disabled) {
  transform: scale(0.98);
}

.btn-login:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.btn-cancel {
  font-size: 0.85em;
  color: var(--nd-fg);
  opacity: 0.6;
  transition: opacity 0.15s;
}

.btn-cancel:hover {
  opacity: 1;
}

/* Waiting state */
.waiting-spinner {
  width: 48px;
  height: 48px;
  border: 3px solid var(--nd-divider);
  border-top-color: var(--nd-accent);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.waiting-info {
  margin-bottom: 24px;
  text-align: center;
}

.waiting-info p {
  font-size: 0.9em;
  line-height: 1.6;
  color: var(--nd-fg);
  margin: 0;
}

/* Error state */
.error-icon-wrap {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 48px;
  height: 48px;
  border-radius: 50%;
  background: var(--nd-love-hover);
  color: var(--nd-love);
  font-size: 1.4em;
}

.error-text {
  margin: 0 0 24px;
  text-align: center;
  color: var(--nd-love);
  font-size: 0.9em;
  line-height: 1.5;
}

/* Step transition */
.step-enter-active,
.step-leave-active {
  transition: opacity 0.3s cubic-bezier(0, 0, 0.35, 1), transform 0.3s cubic-bezier(0, 0, 0.35, 1);
}

.step-enter-from {
  opacity: 0;
  transform: translateX(50px);
}

.step-leave-to {
  opacity: 0;
  transform: translateX(-50px);
}

@media (max-width: 500px) {
  .dialog-body {
    padding: 24px 16px;
  }

  .mk-input {
    height: 44px;
    font-size: 1em;
  }

  .btn-login {
    height: 44px;
  }

  .btn-cancel {
    min-height: 44px;
  }
}

/* Mobile platform (viewport may exceed 500px) */
html.nd-mobile .dialog-body {
  padding: 24px 16px;
}

html.nd-mobile .mk-input {
  height: 44px;
  font-size: 1em;
}

html.nd-mobile .btn-login {
  height: 44px;
}

html.nd-mobile .btn-cancel {
  min-height: 44px;
}
</style>
