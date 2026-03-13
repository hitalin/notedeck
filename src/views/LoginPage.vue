<script setup lang="ts">
import { useRouter } from 'vue-router'
import LoginContent from '@/components/window/LoginContent.vue'
import { useAccountsStore } from '@/stores/accounts'

const router = useRouter()
const accountsStore = useAccountsStore()
const hasAccounts = accountsStore.accounts.length > 0

function onClose() {
  router.push('/')
}

function onSuccess() {
  router.push('/')
}
</script>

<template>
  <div class="login-page">
    <div class="login-dialog">
      <!-- Misskey-style header bar -->
      <div class="dialog-header">
        <div class="header-title">
          <i class="ti ti-login-2 header-icon" />
          <span>アカウントを追加</span>
        </div>
        <button v-if="hasAccounts" class="_button header-close" @click="onClose">
          <i class="ti ti-x" />
        </button>
      </div>

      <LoginContent
        @close="onClose"
        @success="onSuccess"
      />
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
  background: var(--nd-panel);
  border-radius: var(--nd-radius, 12px);
  box-shadow: 0 8px 32px var(--nd-shadow);
  width: 100%;
  max-width: 400px;
  margin: 16px;
  overflow: clip;
}

/* Header bar */
.dialog-header {
  position: sticky;
  top: 0;
  display: flex;
  align-items: center;
  height: 46px;
  padding: 0 8px 0 20px;
  background: color-mix(in srgb, var(--nd-panel) 80%, transparent);
  backdrop-filter: blur(var(--nd-blur));
  -webkit-backdrop-filter: blur(var(--nd-blur));
  border-bottom: 1px solid var(--nd-divider);
  z-index: 1;
}

.header-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-weight: bold;
  font-size: 0.9em;
  color: var(--nd-fgHighlighted);
}

.header-icon {
  font-size: 1.1em;
}

.header-close {
  margin-left: auto;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border-radius: var(--nd-radius-sm);
  color: var(--nd-fg);
  opacity: 0.6;
  transition: background var(--nd-duration-base), opacity var(--nd-duration-base);
}

.header-close:hover {
  background: var(--nd-buttonHoverBg);
  opacity: 1;
}
</style>
