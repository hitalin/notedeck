<script setup lang="ts">
import { computed, defineAsyncComponent, onMounted, onUnmounted } from 'vue'
import {
  useVaporTransition,
  useVaporTransitionGroup,
} from '@/composables/useVaporTransition'
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
const ProfileEditorContent = defineAsyncComponent({
  loader: () => import('@/components/window/ProfileEditorContent.vue'),
  onError(err) {
    console.error('[ProfileEditorContent] load error:', err)
  },
})
const AiContent = defineAsyncComponent(
  () => import('@/components/window/AiContent.vue'),
)
const AiSettingsContent = defineAsyncComponent(
  () => import('@/components/window/AiSettingsContent.vue'),
)
const ChatContent = defineAsyncComponent(
  () => import('@/components/window/ChatContent.vue'),
)
const AboutContent = defineAsyncComponent(
  () => import('@/components/window/AboutContent.vue'),
)
const NavEditorContent = defineAsyncComponent(
  () => import('@/components/window/NavEditorContent.vue'),
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
  enterDuration: 250,
  leaveDuration: 200,
})

// Windows group transition
const {
  rendered: renderedWindows,
  enteringIds: windowEnteringIds,
  leavingIds: windowLeavingIds,
} = useVaporTransitionGroup(
  computed(() => windowsStore.windows),
  { enterDuration: 200, leaveDuration: 150 },
)

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
      :class="[
        windowEnteringIds.has(win.id) && $style.windowEnter,
        windowLeavingIds.has(win.id) && $style.windowLeave,
      ]"
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
      <ProfileEditorContent
        v-if="win.type === 'profileEditor'"
        :profile-id="(win.props.profileId as string)"
      />
      <AiContent v-if="win.type === 'ai'" />
      <AiSettingsContent v-if="win.type === 'aiSettings'" />
      <ChatContent v-if="win.type === 'chat'" />
      <AboutContent v-if="win.type === 'about'" />
      <NavEditorContent v-if="win.type === 'navEditor'" />
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
  animation: backdrop-enter 0.25s ease both;
}

.backdropLeave {
  animation: backdrop-leave 0.2s ease both;
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

.windowEnter {
  animation: window-enter 0.2s ease both;
}

.windowLeave {
  animation: window-leave 0.15s ease both;
}

@keyframes window-enter {
  from {
    opacity: 0;
    transform: scale(0.95);
  }
}

@keyframes window-leave {
  to {
    opacity: 0;
    transform: scale(0.95);
  }
}
</style>
