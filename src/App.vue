<script setup lang="ts">
import { defineAsyncComponent } from 'vue'
import { useTheme } from '@/composables/useTheme'

const isTauri = '__TAURI_INTERNALS__' in window

const TitleBar = defineAsyncComponent(() => import('@/components/common/TitleBar.vue'))

useTheme()
</script>

<template>
  <div class="app-root">
    <TitleBar v-if="isTauri" />
    <div class="app-content">
      <router-view />
    </div>
  </div>
</template>

<style scoped>
.app-root {
  display: flex;
  flex-direction: column;
  height: 100dvh;
  overflow: hidden;
}

.app-content {
  flex: 1;
  min-height: 0;
}
</style>
