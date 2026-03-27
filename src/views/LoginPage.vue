<script setup lang="ts">
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import LoginContent from '@/components/window/LoginContent.vue'
import { useAccountsStore } from '@/stores/accounts'

const route = useRoute()
const router = useRouter()
const accountsStore = useAccountsStore()
const hasAccounts = accountsStore.accounts.length > 0
const initialHost = computed(() => {
  const h = route.query.host
  return typeof h === 'string' ? h : undefined
})

function onClose() {
  router.push('/')
}

function onSuccess() {
  router.push('/')
}
</script>

<template>
  <div :class="$style.loginPage">
    <div :class="$style.loginDialog">
      <!-- Misskey-style header bar -->
      <div :class="$style.dialogHeader">
        <div :class="$style.headerTitle">
          <i class="ti ti-login-2" :class="$style.headerIcon" />
          <span>アカウントを追加</span>
        </div>
        <button v-if="hasAccounts" class="_button" :class="$style.headerClose" @click="onClose">
          <i class="ti ti-x" />
        </button>
      </div>

      <LoginContent
        :initial-host="initialHost"
        @close="onClose"
        @success="onSuccess"
      />
    </div>
  </div>
</template>

<style lang="scss" module>
.loginPage {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 100%;
  background: var(--nd-bg);
}

.loginDialog {
  background: var(--nd-panel);
  border-radius: var(--nd-radius, 12px);
  box-shadow: 0 8px 32px var(--nd-shadow);
  width: 100%;
  max-width: 400px;
  margin: 16px;
  overflow: clip;
}

.dialogHeader {
  position: sticky;
  top: 0;
  display: flex;
  align-items: center;
  height: 46px;
  padding: 0 8px 0 20px;
  background: color-mix(in srgb, var(--nd-panel) 96%, transparent);
  border-bottom: 1px solid var(--nd-divider);
  z-index: 1;
}

.headerTitle {
  display: flex;
  align-items: center;
  gap: 8px;
  font-weight: bold;
  font-size: 0.9em;
  color: var(--nd-fgHighlighted);
}

.headerIcon {
  font-size: 1.1em;
}

.headerClose {
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

  &:hover {
    background: var(--nd-buttonHoverBg);
    opacity: 1;
  }
}
</style>
