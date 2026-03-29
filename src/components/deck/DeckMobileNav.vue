<script setup lang="ts">
import { ref, watch } from 'vue'
import ColumnBadges from '@/components/common/ColumnBadges.vue'
import { useColumnTabs } from '@/composables/useColumnTabs'
import type { DeckColumn } from '@/stores/deck'

const props = defineProps<{
  columns: DeckColumn[]
  layout: string[][]
  activeColumnIndex: number
}>()

const emit = defineEmits<{
  'scroll-to-column': [index: number]
  'toggle-add-menu': []
  'toggle-drawer': []
}>()

const rootEl = ref<HTMLElement | null>(null)
const mobileNavRef = ref<HTMLElement | null>(null)

// Misskey本家と同じパターン: ナビの高さをCSS変数として公開
watch(
  rootEl,
  () => {
    if (rootEl.value) {
      const h = rootEl.value.offsetHeight
      document.body.style.setProperty('--nd-mobileNavHeight', `${h}px`)
    } else {
      document.body.style.setProperty('--nd-mobileNavHeight', '0px')
    }
  },
  { immediate: true },
)

const { visibleGroups, groupPrimaryId, columnIcon, columnAccountId } =
  useColumnTabs(
    () => props.columns,
    () => props.layout,
    () => props.activeColumnIndex,
    mobileNavRef,
  )
</script>

<template>
  <nav ref="rootEl" :class="$style.root">
    <button
      class="_button"
      :class="$style.menuBtn"
      @click="emit('toggle-drawer')"
    >
      <i class="ti ti-menu-2" />
    </button>
    <div ref="mobileNavRef" :class="$style.tabsScroll">
      <button
        v-for="(group, gi) in visibleGroups"
        :key="groupPrimaryId(group)"
        class="_button"
        :class="[$style.tab, { [$style.active]: activeColumnIndex === gi }]"
        @click="emit('scroll-to-column', gi)"
      >
        <i :class="'ti ti-' + columnIcon(groupPrimaryId(group))" />
        <span v-if="group.length > 1" :class="$style.stackBadge">{{ group.length }}</span>
        <ColumnBadges :account-id="columnAccountId(groupPrimaryId(group))" :size="14" />
      </button>
    </div>
    <button
      class="_button"
      :class="$style.addBtn"
      title="カラムを追加"
      @click="emit('toggle-add-menu')"
    >
      <i class="ti ti-plus" />
    </button>
  </nav>
</template>

<style lang="scss" module>
.root {
  display: flex;
  align-items: stretch;
  flex: 0 0 auto;
  padding-bottom: env(safe-area-inset-bottom, 0px);
  background: var(--nd-navBg);
  color: var(--nd-navFg);
  border-top: solid 0.5px var(--nd-divider);
  position: relative;
  z-index: calc(var(--nd-z-navbar) - 1);
}

.menuBtn,
.addBtn {
  flex: 0 0 auto;
  width: 50px;
  padding: 12px 0;
}

.tabsScroll {
  display: flex;
  align-items: stretch;
  justify-content: space-evenly;
  flex: 1;
  min-width: 0;
  overflow-x: auto;
  overflow-y: hidden;
  -webkit-overflow-scrolling: touch;
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
  min-width: 42px;
  padding: 12px 8px;
  font-size: 15px;
  color: var(--nd-fg);
  opacity: 0.45;
  transition: opacity var(--nd-duration-slow), color var(--nd-duration-slow);
  --column-badge-border: var(--nd-navBg);
  --column-badge-server-top: 5px;
  --column-badge-server-right: calc(50% - 16px);
  --column-badge-account-bottom: 4px;
  --column-badge-account-left: calc(50% - 16px);

  &:active {
    opacity: 0.7;
    transform: scale(0.9);
    transition: opacity var(--nd-duration-fast), color var(--nd-duration-slow), transform var(--nd-duration-fast);
  }
}

.active {
  opacity: 1;
  color: var(--nd-accent);

  &::after {
    content: "";
    position: absolute;
    bottom: 0;
    left: 50%;
    translate: -50% 0;
    width: 24px;
    height: 3px;
    border-radius: 3px 3px 0 0;
    background: var(--nd-accent);
  }
}

.stackBadge {
  position: absolute;
  top: 5px;
  left: calc(50% - 16px);
  min-width: 12px;
  height: 12px;
  padding: 0 2px;
  border-radius: 6px;
  background: var(--nd-accent);
  color: var(--nd-bg);
  font-size: 8px;
  font-weight: bold;
  line-height: 12px;
  text-align: center;
}

</style>
