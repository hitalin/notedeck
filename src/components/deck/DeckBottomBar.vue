<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { useAccountsStore } from '@/stores/accounts'
import type { DeckColumn } from '@/stores/deck'
import { useDeckStore } from '@/stores/deck'
import { useServersStore } from '@/stores/servers'
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

const deckStore = useDeckStore()
const accountsStore = useAccountsStore()
const serversStore = useServersStore()

const columnMap = computed(() => {
  const map = new Map<string, DeckColumn>()
  for (const col of props.columns) {
    map.set(col.id, col)
  }
  return map
})

const visibleColumns = computed(() =>
  props.layout.flat().filter((id) => columnMap.value.has(id)),
)

const hasMultipleAccounts = computed(() => accountsStore.accounts.length > 1)

const TAB_ICONS: Record<string, string> = {
  timeline: 'home',
  notifications: 'bell',
  search: 'search',
  list: 'list',
  antenna: 'antenna-bars-5',
  favorites: 'star',
  clip: 'paperclip',
  channel: 'device-tv',
  user: 'user',
  mentions: 'at',
  specified: 'mail',
  chat: 'messages',
  widget: 'app-window',
  aiscript: 'terminal-2',
  play: 'player-play',
  page: 'note',
  ai: 'sparkles',
  announcements: 'speakerphone',
  drive: 'cloud',
  explore: 'compass',
  gallery: 'icons',
  followRequests: 'user-plus',
  achievements: 'medal',
  apiConsole: 'api',
  apiDocs: 'file-description',
  lookup: 'world-search',
  serverInfo: 'server',
  ads: 'ad-2',
  aboutMisskey: 'info-circle',
  emoji: 'mood-smile',
  themeEditor: 'palette',
  cssEditor: 'code',
}

const TL_ICONS: Record<string, string> = {
  home: 'home',
  local: 'planet',
  social: 'rocket',
  global: 'whirl',
}

function columnIcon(colId: string): string {
  const col = columnMap.value.get(colId)
  if (!col) return TAB_ICONS.timeline ?? ''
  if (col.type === 'timeline' && col.tl) {
    return TL_ICONS[col.tl] ?? TAB_ICONS.timeline ?? ''
  }
  return TAB_ICONS[col.type] ?? TAB_ICONS.timeline ?? ''
}

function columnAccount(colId: string) {
  if (!hasMultipleAccounts.value) return null
  const col = columnMap.value.get(colId)
  if (!col?.accountId) return null
  return accountsStore.accountMap.get(col.accountId) ?? null
}

function columnServerIcon(colId: string): string | null {
  if (!hasMultipleAccounts.value) return null
  const acc = columnAccount(colId)
  if (!acc) return null
  return serversStore.getServer(acc.host)?.iconUrl ?? null
}

watch(
  () => props.activeColumnIndex,
  () => {
    nextTick(() => {
      if (!tabsScrollRef.value) return
      const tab = tabsScrollRef.value.children[props.activeColumnIndex] as
        | HTMLElement
        | undefined
      if (tab) {
        tab.scrollIntoView({
          behavior: 'smooth',
          inline: 'center',
          block: 'nearest',
        })
      }
    })
  },
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

    <div ref="tabsScrollRef" :class="$style.tabsScroll">
      <button
        v-for="(colId, i) in visibleColumns"
        :key="colId"
        class="_button"
        :class="[$style.tab, { [$style.tabActive]: activeColumnIndex === i }]"
        @click="emit('scroll-to-column', i)"
      >
        <i :class="'ti ti-' + columnIcon(colId)" />
        <span v-if="columnServerIcon(colId)" :class="$style.serverBadge">
          <img :src="columnServerIcon(colId)!" :class="$style.badgeImg" width="10" height="10" />
        </span>
        <span v-else-if="columnAccount(colId)" :class="$style.serverBadge">
          <span :class="$style.badgeInitial">{{
            columnAccount(colId)!.host.charAt(0).toUpperCase()
          }}</span>
        </span>
        <span v-if="columnAccount(colId)" :class="$style.accountBadge">
          <img
            v-if="columnAccount(colId)!.avatarUrl"
            :src="columnAccount(colId)!.avatarUrl!"
            :class="$style.badgeImg"
            width="10"
            height="10"
          />
          <span v-else :class="$style.badgeInitial">{{
            columnAccount(colId)!.username.charAt(0).toUpperCase()
          }}</span>
        </span>
      </button>
      <button
        class="_button"
        :class="$style.tab"
        title="Add column"
        @click="emit('toggle-add-menu')"
      >
        <i class="ti ti-plus" />
      </button>
    </div>

    <div :class="$style.right">
      <div ref="settingsWrapRef" :class="$style.menuWrap">
        <button
          class="_button"
          :class="[$style.actionBtn, $style.settingsBtn]"
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
  background: var(--nd-navBg);
  border-top: 1px solid var(--nd-divider);
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
  min-width: 28px;
  padding: 0 6px;
  font-size: 12px;
  color: var(--nd-fg);
  opacity: 0.4;
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
    transform: translateX(-50%);
    width: 16px;
    height: 2px;
    border-radius: 2px 2px 0 0;
    background: var(--nd-accent);
  }
}

.serverBadge,
.accountBadge {
  position: absolute;
  width: 10px;
  height: 10px;
  border-radius: 50%;
  overflow: hidden;
  border: 1px solid var(--nd-navBg);
  background: var(--nd-navBg);
  display: flex;
  align-items: center;
  justify-content: center;
}

.serverBadge {
  top: 3px;
  right: calc(50% - 12px);
}

.accountBadge {
  bottom: 2px;
  left: calc(50% - 12px);
}

.badgeImg {
  width: 100%;
  height: 100%;
  object-fit: cover;
  border-radius: 50%;
}

.badgeInitial {
  font-size: 6px;
  font-weight: bold;
  line-height: 1;
  color: var(--nd-fg);
  opacity: 0.7;
}

.actionBtn {
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
