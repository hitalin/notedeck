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
const FollowListContent = defineAsyncComponent(
  () => import('@/components/window/FollowListContent.vue'),
)
const LoginContent = defineAsyncComponent(
  () => import('@/components/window/LoginContent.vue'),
)
const SearchContent = defineAsyncComponent(
  () => import('@/components/window/SearchContent.vue'),
)
const NotificationsContent = defineAsyncComponent(
  () => import('@/components/window/NotificationsContent.vue'),
)
const PluginsContent = defineAsyncComponent(
  () => import('@/components/window/PluginsContent.vue'),
)
const KeybindsContent = defineAsyncComponent(
  () => import('@/components/window/KeybindsContent.vue'),
)
const CssEditorContent = defineAsyncComponent(
  () => import('@/components/window/CssEditorContent.vue'),
)
const ThemeEditorContent = defineAsyncComponent(
  () => import('@/components/window/ThemeEditorContent.vue'),
)
const AiContent = defineAsyncComponent(
  () => import('@/components/window/AiContent.vue'),
)
const ChatContent = defineAsyncComponent(
  () => import('@/components/window/ChatContent.vue'),
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
      :class="$style.windowBackdrop"
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
      <FollowListContent
        v-if="win.type === 'follow-list'"
        :account-id="(win.props.accountId as string)"
        :user-id="(win.props.userId as string)"
        :initial-tab="(win.props.initialTab as 'following' | 'followers' | undefined)"
      />
      <LoginContent
        v-if="win.type === 'login'"
        :initial-host="(win.props.initialHost as string | undefined)"
        @close="closeWindow(win.id)"
        @success="closeWindow(win.id)"
      />
      <SearchContent v-if="win.type === 'search'" />
      <NotificationsContent v-if="win.type === 'notifications'" />
      <PluginsContent v-if="win.type === 'plugins'" />
      <KeybindsContent v-if="win.type === 'keybinds'" />
      <CssEditorContent v-if="win.type === 'cssEditor'" />
      <ThemeEditorContent v-if="win.type === 'themeEditor'" />
      <AiContent v-if="win.type === 'ai'" />
      <ChatContent v-if="win.type === 'chat'" />
    </DeckWindow>
  </TransitionGroup>
</template>

<style lang="scss" module>
.windowBackdrop {
  position: fixed;
  inset: 0;
  z-index: var(--nd-z-window);
  background: var(--nd-modalBg);
}
</style>

<style lang="scss">
/* Vue transition classes (must be global) */
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
