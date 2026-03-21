<script setup lang="ts">
import { invoke } from '@tauri-apps/api/core'
import { openUrl } from '@tauri-apps/plugin-opener'
import { onMounted, ref } from 'vue'
import { MisskeyAuth } from '@/adapters/misskey/auth'
import type { AuthSession } from '@/adapters/types'
import { detectServer } from '@/core/server'
import type { Account } from '@/stores/accounts'
import { useAccountsStore } from '@/stores/accounts'
import { useIsCompactLayout } from '@/stores/ui'
import { AppError } from '@/utils/errors'

const props = defineProps<{
  initialHost?: string
}>()

const emit = defineEmits<{
  close: []
  success: []
}>()

const accountsStore = useAccountsStore()
const isCompact = useIsCompactLayout()
const auth = new MisskeyAuth()

const host = ref(props.initialHost ?? '')
const step = ref<'input' | 'waiting' | 'guestLoading' | 'error'>('input')
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

async function startGuest() {
  const trimmedHost = host.value
    .trim()
    .replace(/^https?:\/\//, '')
    .replace(/\/$/, '')
  if (!trimmedHost) return

  try {
    step.value = 'guestLoading'
    const serverInfo = await detectServer(trimmedHost)
    const account = await invoke<Account>('create_guest_account', {
      host: trimmedHost,
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

onMounted(() => {
  if (props.initialHost) {
    startLogin()
  }
})
</script>

<template>
  <div :class="[$style.loginContent, { [$style.mobile]: isCompact }]">
    <Transition name="step" mode="out-in">
      <!-- Step 1: Input -->
      <div v-if="step === 'input'" key="input" :class="$style.dialogBody">
        <div :class="$style.logoArea">
          <img src="/favicon.svg" alt="NoteDeck" :class="$style.appLogo" />
          <p :class="$style.subtitle">Misskeyサーバーに接続</p>
        </div>

        <div :class="$style.formArea">
          <label :class="$style.inputLabel" for="host">サーバーアドレス</label>
          <input
            id="host"
            v-model="host"
            type="text"
            :class="$style.mkInput"
            placeholder="misskey.io"
            autocomplete="off"
            @keyup.enter="startLogin"
          />
        </div>

        <div :class="$style.actions">
          <button
            :class="$style.btnLogin"
            :disabled="!host.trim()"
            @click="startLogin"
          >
            ログイン
          </button>
          <button
            class="_button"
            :class="$style.btnGuest"
            :disabled="!host.trim()"
            @click="startGuest"
          >
            ゲストとして閲覧
          </button>
          <button class="_button" :class="$style.btnCancel" @click="emit('close')">
            キャンセル
          </button>
        </div>
      </div>

      <!-- Step 2a: Guest loading -->
      <div v-else-if="step === 'guestLoading'" key="guestLoading" :class="$style.dialogBody">
        <div :class="$style.logoArea">
          <div :class="$style.waitingSpinner" />
          <p :class="$style.subtitle">サーバーに接続中...</p>
        </div>
      </div>

      <!-- Step 2: Waiting -->
      <div v-else-if="step === 'waiting'" key="waiting" :class="$style.dialogBody">
        <div :class="$style.logoArea">
          <div :class="$style.waitingSpinner" />
          <p :class="$style.subtitle">認証待ち...</p>
        </div>

        <div :class="$style.waitingInfo">
          <p>ブラウザで認証画面が開きました。</p>
          <p>認証が完了したら、下のボタンをクリックしてください。</p>
        </div>

        <div :class="$style.actions">
          <button :class="$style.btnLogin" @click="completeLogin">
            認証しました
          </button>
          <button class="_button" :class="$style.btnCancel" @click="reset">
            キャンセル
          </button>
        </div>
      </div>

      <!-- Step 3: Error -->
      <div v-else-if="step === 'error'" key="error" :class="$style.dialogBody">
        <div :class="$style.logoArea">
          <div :class="$style.errorIconWrap">
            <i class="ti ti-alert-triangle" />
          </div>
        </div>

        <p :class="$style.errorText">{{ errorMessage }}</p>

        <div :class="$style.actions">
          <button :class="$style.btnLogin" @click="reset">
            やり直す
          </button>
        </div>
      </div>
    </Transition>
  </div>
</template>

<style lang="scss" module>
.loginContent {
  height: 100%;
  overflow-y: auto;
  display: flex;
  align-items: center;
  justify-content: center;
}

.dialogBody {
  padding: 32px;
}

.logoArea {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  margin-bottom: 28px;
}

.appLogo {
  width: 48px;
  height: 48px;
  border-radius: 10px;
}

.subtitle {
  font-size: 0.85em;
  color: var(--nd-fg);
  opacity: 0.7;
}

.formArea {
  margin-bottom: 24px;
}

.inputLabel {
  display: block;
  font-size: 0.85em;
  font-weight: bold;
  padding: 0 0 8px 2px;
  color: var(--nd-fg);
}

.mkInput {
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
  transition: border-color var(--nd-duration-base);

  &:hover {
    border-color: var(--nd-inputBorderHover);
  }

  &:focus {
    border-color: var(--nd-accent);
  }

  &::placeholder {
    color: var(--nd-fg);
    opacity: 0.35;
  }
}

.actions {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
}

.btnLogin {
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
  transition: transform var(--nd-duration-base), box-shadow var(--nd-duration-base), opacity var(--nd-duration-base);

  &:hover:not(:disabled) {
    transform: scale(1.02);
    box-shadow: 0 4px 12px rgba(134, 179, 0, 0.3);
  }

  &:active:not(:disabled) {
    transform: scale(0.98);
  }

  &:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }
}

.btnGuest {
  font-size: 0.85em;
  color: var(--nd-accent);
  transition: opacity var(--nd-duration-base);

  &:hover:not(:disabled) {
    opacity: 0.8;
  }

  &:disabled {
    opacity: 0.3;
  }
}

.btnCancel {
  font-size: 0.85em;
  color: var(--nd-fg);
  opacity: 0.6;
  transition: opacity var(--nd-duration-base);

  &:hover {
    opacity: 1;
  }
}

.waitingSpinner {
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

.waitingInfo {
  margin-bottom: 24px;
  text-align: center;

  p {
    font-size: 0.9em;
    line-height: 1.6;
    color: var(--nd-fg);
    margin: 0;
  }
}

.errorIconWrap {
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

.errorText {
  margin: 0 0 24px;
  text-align: center;
  color: var(--nd-love);
  font-size: 0.9em;
  line-height: 1.5;
}

.mobile {
  .dialogBody {
    padding: 24px 16px;
  }

  .mkInput {
    height: 44px;
    font-size: 1em;
  }

  .btnLogin {
    height: 44px;
  }

  .btnCancel {
    min-height: 44px;
  }
}
</style>

<!-- Transition classes (must be unscoped for Vue transitions) -->
<style>
.step-enter-active,
.step-leave-active {
  transition: opacity var(--nd-duration-slower) cubic-bezier(0, 0, 0.35, 1), transform var(--nd-duration-slower) cubic-bezier(0, 0, 0.35, 1);
}

.step-enter-from {
  opacity: 0;
  transform: translateX(50px);
}

.step-leave-to {
  opacity: 0;
  transform: translateX(-50px);
}
</style>
