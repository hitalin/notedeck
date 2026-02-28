<script setup lang="ts">
import { onMounted } from 'vue'
import { useUpdater } from '@/composables/useUpdater'

const {
  updateAvailable,
  updateVersion,
  isInstalling,
  dismissed,
  checkForUpdate,
  installUpdate,
  dismiss,
} = useUpdater()

onMounted(() => {
  setTimeout(checkForUpdate, 5000)
})
</script>

<template>
  <Transition name="banner">
    <div v-if="updateAvailable && !dismissed" class="update-banner">
      <span class="update-text">
        v{{ updateVersion }} が利用可能です
      </span>
      <button
        class="update-btn"
        :disabled="isInstalling"
        @click="installUpdate"
      >
        {{ isInstalling ? 'インストール中...' : 'アップデート' }}
      </button>
      <button
        v-if="!isInstalling"
        class="dismiss-btn"
        title="閉じる"
        @click="dismiss"
      >
        <i class="ti ti-x" />
      </button>
    </div>
  </Transition>
</template>

<style scoped>
.update-banner {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 12px;
  background: var(--nd-accentedBg, rgba(134, 179, 0, 0.15));
  font-size: 0.8em;
  flex-shrink: 0;
}

.update-text {
  color: var(--nd-fg);
  opacity: 0.9;
  flex: 1;
}

.update-btn {
  padding: 2px 10px;
  border: none;
  border-radius: 4px;
  background: var(--nd-accent, #86b300);
  color: #fff;
  font-size: 0.85em;
  cursor: pointer;
  white-space: nowrap;
  transition: opacity 0.15s;
}

.update-btn:hover:not(:disabled) {
  opacity: 0.85;
}

.update-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.dismiss-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  border: none;
  background: transparent;
  color: var(--nd-fg);
  opacity: 0.5;
  cursor: pointer;
  border-radius: 50%;
  transition: opacity 0.15s;
}

.dismiss-btn:hover {
  opacity: 1;
}

.banner-enter-active,
.banner-leave-active {
  transition: all 0.2s ease;
}

.banner-enter-from,
.banner-leave-to {
  opacity: 0;
  max-height: 0;
  padding-top: 0;
  padding-bottom: 0;
}
</style>
