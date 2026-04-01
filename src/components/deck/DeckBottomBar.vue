<script setup lang="ts">
import { ref } from 'vue'
import { useCommandStore } from '@/commands/registry'
import ColumnBadges from '@/components/common/ColumnBadges.vue'
import { useColumnTabs } from '@/composables/useColumnTabs'
import type { DeckColumn } from '@/stores/deck'
import { useDeckStore } from '@/stores/deck'
import { useUiStore } from '@/stores/ui'
import DeckProfileMenu from './DeckProfileMenu.vue'
import DeckSettingsMenu from './DeckSettingsMenu.vue'

const props = defineProps<{
  showProfileMenu: boolean
  showSettingsMenu: boolean
  updateAvailable: boolean
  columns: DeckColumn[]
  layout: string[][]
  activeColumnIndex: number
}>()

const profileWrapRef = ref<HTMLElement>()
const settingsWrapRef = ref<HTMLElement>()
const tabsScrollRef = ref<HTMLElement>()

const emit = defineEmits<{
  'toggle-add-menu': []
  'update:show-profile-menu': [value: boolean]
  'update:show-settings-menu': [value: boolean]
  'scroll-to-column': [index: number]
}>()

const { isDesktop } = useUiStore()
const commandStore = useCommandStore()
const deckStore = useDeckStore()

function onProfileClick() {
  if (isDesktop) {
    commandStore.openWithInput('#')
  } else {
    emit('update:show-profile-menu', !props.showProfileMenu)
  }
}

function onSettingsClick() {
  if (isDesktop) {
    commandStore.openWithInput('*')
  } else {
    emit('update:show-settings-menu', !props.showSettingsMenu)
  }
}

function onAddColumnClick() {
  if (isDesktop) {
    commandStore.openWithInput('+')
  } else {
    emit('toggle-add-menu')
  }
}

const { visibleGroups, groupPrimaryId, columnIcon, columnAccountId } =
  useColumnTabs(
    () => props.columns,
    () => props.layout,
    () => props.activeColumnIndex,
    tabsScrollRef,
  )
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
          @click.stop="onProfileClick()"
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

    <div ref="tabsScrollRef" :class="$style.tabsScroll">
      <button
        v-for="(group, gi) in visibleGroups"
        :key="groupPrimaryId(group)"
        class="_button"
        :class="[$style.tab, { [$style.tabActive]: activeColumnIndex === gi }]"
        @click="emit('scroll-to-column', gi)"
      >
        <i :class="'ti ti-' + columnIcon(groupPrimaryId(group))" />
        <span v-if="group.length > 1" :class="$style.stackBadge">{{ group.length }}</span>
        <ColumnBadges :account-id="columnAccountId(groupPrimaryId(group))" :size="14" />
      </button>
      <button
        class="_button"
        :class="$style.tab"
        title="カラムを追加"
        @click="onAddColumnClick()"
      >
        <i class="ti ti-plus" />
      </button>
    </div>

    <div :class="$style.right">
      <div ref="settingsWrapRef" :class="$style.menuWrap">
        <button
          class="_button"
          :class="[$style.actionBtn, $style.settingsBtn]"
          title="デッキ設定"
          @pointerdown.stop
          @click.stop="onSettingsClick()"
        >
          <i class="ti ti-settings" />
        </button>
        <DeckSettingsMenu
          :show="showSettingsMenu"
          :anchor="settingsWrapRef"
          @close="emit('update:show-settings-menu', false)"
          @close-all="emit('update:show-settings-menu', false)"
        />
      </div>
    </div>
  </div>
</template>

<style lang="scss" module>
@use '@/styles/buttons' as *;
.root {
  --bar-item-size: 42px;
  --bar-icon-size: 16px;
  flex: 0 0 auto;
  display: flex;
  align-items: stretch;
  margin-left: calc(-1 * (var(--nd-nav-resize-handle) + var(--nd-nav-border)));
  padding-left: calc(var(--nd-nav-resize-handle) + var(--nd-nav-border));
  background: color-mix(in srgb, var(--nd-navBg) 50%, var(--nd-deckBg, #1a1a1a));
  box-shadow: 0 -0.5px 0 0 var(--nd-divider);
}

.left {
  flex: 0 0 auto;
  height: 100%;
}

.right {
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  height: 100%;
  padding-right: 4px;
}

.menuWrap {
  position: relative;
  height: 100%;
}

.profileIndicator {
  display: flex;
  align-items: center;
  gap: 6px;
  height: 100%;
  padding: 0 12px;
  color: var(--nd-fg);
  font-size: 0.85em;
  white-space: nowrap;
  opacity: 0.7;
  transition: opacity var(--nd-duration-base), background var(--nd-duration-base);

  &:hover {
    opacity: 1;
    background: var(--nd-buttonHoverBg);
  }

  .ti {
    font-size: var(--bar-icon-size);
    flex-shrink: 0;
    color: var(--nd-accent);
  }
}

.profileName {
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 120px;
}

.tabsScroll {
  display: flex;
  align-items: stretch;
  justify-content: center;
  flex: 1;
  min-width: 0;
  height: 100%;
  overflow-x: auto;
  overflow-y: hidden;
  scrollbar-width: none;

  &::-webkit-scrollbar {
    display: none;
  }
}

.tab {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  flex: 0 0 auto;
  min-width: var(--bar-item-size);
  padding: 10px 8px;
  font-size: var(--bar-icon-size);
  color: var(--nd-fg);
  opacity: 0.4;
  --column-badge-border: var(--nd-navBg);
  --column-badge-server-top: 3px;
  --column-badge-server-right: calc(50% - 16px);
  --column-badge-account-bottom: 3px;
  --column-badge-account-left: calc(50% - 16px);
  transition: opacity var(--nd-duration-base), color var(--nd-duration-base),
    background var(--nd-duration-base);

  &:hover {
    opacity: 0.8;
    background: var(--nd-buttonHoverBg);
  }
}

.tabActive {
  opacity: 1;
  color: var(--nd-accent);

  &::after {
    content: "";
    position: absolute;
    bottom: 0;
    left: 50%;
    translate: -50% 0;
    width: 20px;
    height: 3px;
    border-radius: 3px 3px 0 0;
    background: var(--nd-accent);
  }
}

.stackBadge {
  position: absolute;
  top: 4px;
  left: calc(50% - 16px);
  min-width: 14px;
  height: 14px;
  padding: 0 3px;
  border-radius: 7px;
  background: var(--nd-accent);
  color: var(--nd-bg);
  font-size: 9px;
  font-weight: bold;
  line-height: 14px;
  text-align: center;
}

.actionBtn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: var(--bar-item-size);
  height: var(--bar-item-size);
  font-size: var(--bar-icon-size);
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

.updateDot { @include update-dot(6px, 6px); }

</style>
