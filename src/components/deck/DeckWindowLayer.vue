<script setup lang="ts">
import { defineAsyncComponent, onMounted, onUnmounted } from 'vue'
import { useThemeStore } from '@/stores/theme'
import { useWindowsStore } from '@/stores/windows'
import DeckWindow from './DeckWindow.vue'

const NoteDetailContent = defineAsyncComponent(
  () => import('@/components/window/NoteDetailContent.vue'),
)
const UserProfileContent = defineAsyncComponent(
  () => import('@/components/window/UserProfileContent.vue'),
)
const LoginContent = defineAsyncComponent(
  () => import('@/components/window/LoginContent.vue'),
)
const SearchContent = defineAsyncComponent(
  () => import('@/components/window/SearchContent.vue'),
)

const windowsStore = useWindowsStore()
const themeStore = useThemeStore()

function getThemeVars(accountId: unknown): Record<string, string> | undefined {
  if (typeof accountId !== 'string') return undefined
  return themeStore.getStyleVarsForAccount(accountId)
}

function closeWindow(id: string) {
  windowsStore.close(id)
}

function onKeydown(e: KeyboardEvent) {
  if (e.key !== 'Escape') return
  if (windowsStore.windows.length === 0) return
  const topWin = [...windowsStore.windows].sort(
    (a, b) => b.zIndex - a.zIndex,
  )[0]
  if (topWin) windowsStore.close(topWin.id)
}

onMounted(() => document.addEventListener('keydown', onKeydown))
onUnmounted(() => document.removeEventListener('keydown', onKeydown))
</script>

<template>
  <!-- Modal backdrop -->
  <Transition name="fade">
    <div
      v-if="windowsStore.hasModal"
      class="window-backdrop"
      @click="windowsStore.windows.filter(w => w.modal).forEach(w => closeWindow(w.id))"
    />
  </Transition>

  <!-- Windows -->
  <TransitionGroup name="window">
    <DeckWindow
      v-for="win in windowsStore.windows"
      :key="win.id"
      :window="win"
      :theme-vars="getThemeVars(win.props.accountId)"
      @close="closeWindow(win.id)"
    >
      <NoteDetailContent
        v-if="win.type === 'note-detail'"
        :account-id="(win.props.accountId as string)"
        :note-id="(win.props.noteId as string)"
        @close="closeWindow(win.id)"
      />
      <UserProfileContent
        v-if="win.type === 'user-profile'"
        :account-id="(win.props.accountId as string)"
        :user-id="(win.props.userId as string)"
      />
      <LoginContent
        v-if="win.type === 'login'"
        @close="closeWindow(win.id)"
        @success="closeWindow(win.id)"
      />
      <SearchContent v-if="win.type === 'search'" />
    </DeckWindow>
  </TransitionGroup>
</template>

<style scoped>
.window-backdrop {
  position: fixed;
  inset: 0;
  z-index: 1700;
  background: var(--nd-modalBg);
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.25s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

.window-enter-active {
  transition:
    opacity 0.2s ease,
    transform 0.2s ease;
}

.window-leave-active {
  transition:
    opacity 0.15s ease,
    transform 0.15s ease;
}

.window-enter-from {
  opacity: 0;
  transform: scale(0.95);
}

.window-leave-to {
  opacity: 0;
  transform: scale(0.95);
}
</style>
