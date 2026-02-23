<script setup lang="ts">
import { onMounted } from 'vue'
import { usePwa } from '@/composables/usePwa'

const { needsRefresh, initPwa, applyUpdate, dismissUpdate } = usePwa()

onMounted(() => {
  initPwa()
})
</script>

<template>
  <router-view />

  <div v-if="needsRefresh" class="pwa-toast">
    <span>New version available</span>
    <button @click="applyUpdate">Update</button>
    <button @click="dismissUpdate">Dismiss</button>
  </div>
</template>

<style scoped>
.pwa-toast {
  position: fixed;
  bottom: 1rem;
  right: 1rem;
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.75rem 1rem;
  background: var(--nd-panel);
  border: 1px solid var(--nd-accent);
  border-radius: 0.5rem;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
  z-index: 100;
  font-size: 0.875rem;
}

.pwa-toast button {
  padding: 0.25rem 0.5rem;
  border: 1px solid currentColor;
  border-radius: 0.25rem;
  background: transparent;
  color: var(--nd-accent);
  cursor: pointer;
  font-size: 0.75rem;
}
</style>
