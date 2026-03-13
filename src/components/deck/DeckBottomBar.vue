<script setup lang="ts">
import { ref } from 'vue'
import { useDeckStore } from '@/stores/deck'
import DeckProfileMenu from './DeckProfileMenu.vue'
import DeckSettingsMenu from './DeckSettingsMenu.vue'

defineProps<{
  showProfileMenu: boolean
  showSettingsMenu: boolean
  updateAvailable: boolean
}>()

const profileWrapRef = ref<HTMLElement>()
const settingsWrapRef = ref<HTMLElement>()

const emit = defineEmits<{
  'toggle-add-menu': []
  'update:show-profile-menu': [value: boolean]
  'update:show-settings-menu': [value: boolean]
}>()

const deckStore = useDeckStore()
</script>

<template>
  <div :class="$style.root">
    <div :class="$style.left">
      <div ref="profileWrapRef" :class="$style.menuWrap">
        <button
          class="_button"
          :class="$style.profileIndicator"
          title="プロファイル切替"
          @pointerdown.stop
          @click.stop="emit('update:show-profile-menu', !showProfileMenu)"
        >
          <i class="ti ti-layout" />
          <span :class="$style.profileName">{{ deckStore.currentProfileName ?? 'プロファイル' }}</span>
        </button>
        <DeckProfileMenu
          :show="showProfileMenu"
          :anchor="profileWrapRef"
          @close="emit('update:show-profile-menu', false)"
        />
      </div>
    </div>
    <button
      class="_button"
      :class="$style.btn"
      title="Add column"
      @click="emit('toggle-add-menu')"
    >
      <i class="ti ti-plus" />
    </button>
    <div :class="$style.right">
      <div ref="settingsWrapRef" :class="$style.menuWrap">
        <button
          class="_button"
          :class="[$style.btn, $style.settingsBtn]"
          title="Deck settings"
          @pointerdown.stop
          @click.stop="emit('update:show-settings-menu', !showSettingsMenu)"
        >
          <i class="ti ti-settings" />
          <span v-if="updateAvailable" :class="$style.updateDot" />
        </button>
        <DeckSettingsMenu
          :show="showSettingsMenu"
          :anchor="settingsWrapRef"
          @close="emit('update:show-settings-menu', false)"
        />
      </div>
    </div>
  </div>
</template>

<style lang="scss" module>
.root {
  flex: 0 0 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--nd-navBg);
  border-top: 1px solid var(--nd-divider);
}

.left {
  flex: 1;
  height: 100%;
}

.right {
  flex: 1;
  display: flex;
  justify-content: flex-end;
  padding-right: 8px;
}

.menuWrap {
  position: relative;
  height: 100%;
}

.profileIndicator {
  display: flex;
  align-items: center;
  gap: 4px;
  height: 100%;
  padding: 0 8px;
  color: var(--nd-fg);
  font-size: 0.75em;
  white-space: nowrap;
  opacity: 0.7;
  transition: opacity var(--nd-duration-base), background var(--nd-duration-base);

  &:hover {
    opacity: 1;
    background: var(--nd-buttonHoverBg);
  }

  .ti {
    font-size: 12px;
    flex-shrink: 0;
    color: var(--nd-accent);
  }
}

.profileName {
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 120px;
}

.btn {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  aspect-ratio: 1;
  color: var(--nd-fg);
  opacity: 0.5;
  transition: opacity var(--nd-duration-base), background var(--nd-duration-base);

  &:hover {
    opacity: 1;
    background: var(--nd-buttonHoverBg);
  }
}

.settingsBtn {
  position: relative;
}

.updateDot {
  position: absolute;
  top: 6px;
  right: 6px;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--nd-accent);
  pointer-events: none;
}

</style>
