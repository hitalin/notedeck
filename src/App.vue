<script setup lang="ts">
import { defineAsyncComponent } from 'vue'
import { useCommandStore } from '@/commands/registry'
import { useKeyboard } from '@/composables/useKeyboard'
import { useTheme } from '@/composables/useTheme'

const isTauri = '__TAURI_INTERNALS__' in window
const isDesktop =
  isTauri && matchMedia('(hover: hover) and (pointer: fine)').matches

const TitleBar = isDesktop
  ? defineAsyncComponent(() => import('@/components/common/TitleBar.vue'))
  : null

const UpdateBanner = isDesktop
  ? defineAsyncComponent(() => import('@/components/common/UpdateBanner.vue'))
  : null

const CommandPalette = defineAsyncComponent(
  () => import('@/components/common/CommandPalette.vue'),
)

const commandStore = useCommandStore()

useTheme()
const { init: initKeyboard } = useKeyboard()
initKeyboard()
</script>

<template>
  <div class="app-root">
    <template v-if="isTauri">
      <TitleBar v-if="isDesktop" />
      <UpdateBanner v-if="isDesktop" />
      <div class="app-content">
        <router-view />
      </div>
    </template>
    <div v-else class="no-tauri">
      <p>NoteDeck requires the Tauri runtime.</p>
      <p>Run <code>pnpm tauri:dev</code> instead of <code>pnpm dev</code>.</p>
    </div>

    <Teleport to="body">
      <CommandPalette v-if="commandStore.isOpen" />
    </Teleport>
  </div>
</template>

<style scoped>
.app-root {
  display: flex;
  flex-direction: column;
  height: 100dvh;
  overflow: hidden;
  padding-top: env(safe-area-inset-top);
}

.app-content {
  flex: 1;
  min-height: 0;
}

.no-tauri {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  color: #888;
  font-size: 0.9em;
  gap: 4px;
}

.no-tauri code {
  background: #333;
  padding: 2px 6px;
  border-radius: 4px;
  color: #ddd;
}
</style>
