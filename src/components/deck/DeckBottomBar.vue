<script setup lang="ts">
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
</script>

<template>
  <div class="bottom-bar">
    <div class="bottom-bar-left">
      <div class="profile-menu-wrap">
        <button
          class="_button bottom-bar-btn"
          title="Deck profiles"
          @click.stop="emit('update:show-profile-menu', !showProfileMenu)"
        >
          <i class="ti ti-caret-down" />
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
}

.bottom-bar-right {
  flex: 1;
  display: flex;
  justify-content: flex-end;
}

.profile-menu-wrap,
.settings-menu-wrap {
  position: relative;
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

@media (max-width: 500px) {
  .bottom-bar {
    display: none !important;
  }
}
</style>
