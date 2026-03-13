<script setup lang="ts">
import { useDeckStore } from '@/stores/deck'
import DeckProfileMenu from './DeckProfileMenu.vue'
import DeckSettingsMenu from './DeckSettingsMenu.vue'

defineProps<{
  showProfileMenu: boolean
  showSettingsMenu: boolean
  updateAvailable: boolean
}>()

const emit = defineEmits<{
  'toggle-add-menu': []
  'update:show-profile-menu': [value: boolean]
  'update:show-settings-menu': [value: boolean]
}>()

const deckStore = useDeckStore()
</script>

<template>
  <div class="bottom-bar">
    <div class="bottom-bar-left">
      <div class="profile-menu-wrap">
        <button
          class="_button profile-indicator"
          title="プロファイル切替"
          @pointerdown.stop
          @click.stop="emit('update:show-profile-menu', !showProfileMenu)"
        >
          <i class="ti ti-layout" />
          <span class="profile-indicator-name">{{ deckStore.currentProfileName ?? 'プロファイル' }}</span>
        </button>
        <DeckProfileMenu
          :show="showProfileMenu"
          @close="emit('update:show-profile-menu', false)"
        />
      </div>
    </div>
    <button
      class="_button bottom-bar-btn"
      title="Add column"
      @click="emit('toggle-add-menu')"
    >
      <i class="ti ti-plus" />
    </button>
    <div class="bottom-bar-right">
      <div class="settings-menu-wrap">
        <button
          class="_button bottom-bar-btn settings-btn"
          title="Deck settings"
          @pointerdown.stop
          @click.stop="emit('update:show-settings-menu', !showSettingsMenu)"
        >
          <i class="ti ti-settings" />
          <span v-if="updateAvailable" class="update-dot" />
        </button>
        <DeckSettingsMenu
          :show="showSettingsMenu"
          @close="emit('update:show-settings-menu', false)"
        />
      </div>
    </div>
  </div>
</template>

<style scoped>
.bottom-bar {
  flex: 0 0 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--nd-navBg);
  border-top: 1px solid var(--nd-divider);
}

.bottom-bar-left {
  flex: 1;
  height: 100%;
}

.bottom-bar-right {
  flex: 1;
  display: flex;
  justify-content: flex-end;
  padding-right: 8px;
}

.profile-menu-wrap,
.settings-menu-wrap {
  position: relative;
  height: 100%;
}

.profile-indicator {
  display: flex;
  align-items: center;
  gap: 4px;
  height: 100%;
  padding: 0 8px;
  color: var(--nd-fg);
  font-size: 0.75em;
  white-space: nowrap;
  opacity: 0.7;
  transition: opacity 0.15s, background 0.15s;
}

.profile-indicator:hover {
  opacity: 1;
  background: var(--nd-buttonHoverBg);
}

.profile-indicator .ti {
  font-size: 12px;
  flex-shrink: 0;
  color: var(--nd-accent);
}

.profile-indicator-name {
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 120px;
}

.bottom-bar-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  aspect-ratio: 1;
  color: var(--nd-fg);
  opacity: 0.5;
  transition: opacity 0.15s, background 0.15s;
}

.bottom-bar-btn:hover {
  opacity: 1;
  background: var(--nd-buttonHoverBg);
}

.settings-btn {
  position: relative;
}

.update-dot {
  position: absolute;
  top: 6px;
  right: 6px;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--nd-accent);
  pointer-events: none;
}

/* Small viewport: hide bottom bar */
@media (max-width: 500px) {
  .bottom-bar {
    display: none;
  }
}

/* Mobile platform (viewport may exceed 500px) */
html.nd-mobile .bottom-bar {
  display: none;
}
</style>
