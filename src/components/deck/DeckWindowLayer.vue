<script setup lang="ts">
import { computed, defineAsyncComponent, onMounted, onUnmounted } from 'vue'
import { useVaporTransition } from '@/composables/useVaporTransition'
import { useThemeStore } from '@/stores/theme'
import { useWindowsStore } from '@/stores/windows'
import DeckWindow from './DeckWindow.vue'

const NoteDetailContent = defineAsyncComponent(
  () => import('@/components/window/NoteDetailContent.vue'),
)
const NoteInspectorContent = defineAsyncComponent(
  () => import('@/components/window/NoteInspectorContent.vue'),
)
const NotificationInspectorContent = defineAsyncComponent(
  () => import('@/components/window/NotificationInspectorContent.vue'),
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
const ProfileEditorContent = defineAsyncComponent({
  loader: () => import('@/components/window/ProfileEditorContent.vue'),
  onError(err) {
    console.error('[ProfileEditorContent] load error:', err)
  },
})
const AiSettingsContent = defineAsyncComponent(
  () => import('@/components/window/AiSettingsContent.vue'),
)
const AboutContent = defineAsyncComponent(
  () => import('@/components/window/AboutContent.vue'),
)
const NavEditorContent = defineAsyncComponent(
  () => import('@/components/window/NavEditorContent.vue'),
)
const PerformanceEditorContent = defineAsyncComponent(
  () => import('@/components/window/PerformanceEditorContent.vue'),
)
const AccountManagerContent = defineAsyncComponent(
  () => import('@/components/window/AccountManagerContent.vue'),
)
const AppearanceEditorContent = defineAsyncComponent(
  () => import('@/components/window/AppearanceEditorContent.vue'),
)
const BackupContent = defineAsyncComponent(
  () => import('@/components/window/BackupContent.vue'),
)
const TasksEditorContent = defineAsyncComponent(
  () => import('@/components/window/TasksEditorContent.vue'),
)

const windowsStore = useWindowsStore()
const themeStore = useThemeStore()

// Backdrop fade transition
const hasModal = computed(() => windowsStore.hasModal)
const {
  visible: backdropVisible,
  entering: backdropEntering,
  leaving: backdropLeaving,
} = useVaporTransition(hasModal, {
  enterDuration: 200,
  leaveDuration: 200,
})

const renderedWindows = computed(() => windowsStore.windows)

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
  <div
    v-if="backdropVisible"
    :class="[
      $style.windowBackdrop,
      backdropEntering && $style.backdropEnter,
      backdropLeaving && $style.backdropLeave,
    ]"
    @click="windowsStore.windows.filter(w => w.modal).forEach(w => closeWindow(w.id))"
  />

  <!-- Windows -->
  <div>
    <DeckWindow
      v-for="win in renderedWindows"
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
      <NoteInspectorContent
        v-if="win.type === 'note-inspector'"
        :account-id="(win.props.accountId as string)"
        :note-id="(win.props.noteId as string)"
        :note-uri="(win.props.noteUri as string | undefined)"
        :server-host="(win.props.serverHost as string | undefined)"
      />
      <NotificationInspectorContent
        v-if="win.type === 'notification-inspector'"
        :account-id="(win.props.accountId as string)"
        :notification="(win.props.notification as any)"
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
      <PluginsContent
        v-if="win.type === 'plugins'"
        :initial-plugin-id="(win.props.initialPluginId as string | undefined)"
        :initial-tab="(win.props.initialTab as string | undefined)"
      />
      <KeybindsContent
        v-if="win.type === 'keybinds'"
        :initial-tab="(win.props.initialTab as string | undefined)"
      />
      <CssEditorContent
        v-if="win.type === 'cssEditor'"
        :initial-tab="(win.props.initialTab as string | undefined)"
      />
      <ThemeEditorContent
        v-if="win.type === 'themeEditor'"
        :initial-theme-id="(win.props.initialThemeId as string | undefined)"
        :initial-tab="(win.props.initialTab as string | undefined)"
      />
      <ProfileEditorContent
        v-if="win.type === 'profileEditor'"
        :profile-id="(win.props.profileId as string)"
        :initial-tab="(win.props.initialTab as string | undefined)"
      />
      <AiSettingsContent
        v-if="win.type === 'aiSettings'"
        :initial-tab="(win.props.initialTab as string | undefined)"
      />
      <AboutContent v-if="win.type === 'about'" />
      <NavEditorContent
        v-if="win.type === 'navEditor'"
        :initial-tab="(win.props.initialTab as string | undefined)"
      />
      <PerformanceEditorContent
        v-if="win.type === 'performanceEditor'"
        :initial-tab="(win.props.initialTab as string | undefined)"
      />
      <AccountManagerContent
        v-if="win.type === 'account-manager'"
        :initial-tab="(win.props.initialTab as string | undefined)"
        @close="closeWindow(win.id)"
      />
      <AppearanceEditorContent
        v-if="win.type === 'appearanceEditor'"
        :initial-tab="(win.props.initialTab as string | undefined)"
      />
      <BackupContent
        v-if="win.type === 'backup'"
        :initial-tab="(win.props.initialTab as 'notedeck' | 'db' | undefined)"
      />
      <TasksEditorContent
        v-if="win.type === 'tasksEditor'"
      />
    </DeckWindow>
  </div>
</template>

<style lang="scss" module>
.windowBackdrop {
  position: fixed;
  top: var(--nd-app-inset-top, 0px);
  left: 0;
  right: 0;
  bottom: 0;
  z-index: var(--nd-z-window);
  background: var(--nd-modalBg);
}

.backdropEnter {
  animation: backdrop-enter 0.18s ease-out both;
}

.backdropLeave {
  animation: backdrop-leave var(--nd-duration-base) ease-out both;
}

@keyframes backdrop-enter {
  from {
    opacity: 0;
  }
}

@keyframes backdrop-leave {
  to {
    opacity: 0;
  }
}

</style>
