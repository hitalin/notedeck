<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { useAccountsStore } from '@/stores/accounts'
import type { DeckColumn } from '@/stores/deck'
import { useServersStore } from '@/stores/servers'

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

const accountsStore = useAccountsStore()
const serversStore = useServersStore()

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

const MOBILE_TAB_ICONS: Record<string, string> = {
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
  if (!col) return MOBILE_TAB_ICONS.timeline ?? ''
  if (col.type === 'timeline' && col.tl) {
    return TL_ICONS[col.tl] ?? MOBILE_TAB_ICONS.timeline ?? ''
  }
  return MOBILE_TAB_ICONS[col.type] ?? MOBILE_TAB_ICONS.timeline ?? ''
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
      if (!mobileNavRef.value) return
      const tab = mobileNavRef.value.children[props.activeColumnIndex] as
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
        v-for="(colId, i) in visibleColumns"
        :key="colId"
        class="_button"
        :class="[$style.tab, { [$style.active]: activeColumnIndex === i }]"
        @click="emit('scroll-to-column', i)"
      >
        <i :class="'ti ti-' + columnIcon(colId)" />
        <span v-if="columnServerIcon(colId)" :class="$style.serverBadge">
          <img :src="columnServerIcon(colId)!" :class="$style.badgeImg" />
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
          />
          <span v-else :class="$style.badgeInitial">{{
            columnAccount(colId)!.username.charAt(0).toUpperCase()
          }}</span>
        </span>
      </button>
    </div>
    <button
      class="_button"
      :class="$style.addBtn"
      title="Add column"
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
    transform: translateX(-50%);
    width: 24px;
    height: 3px;
    border-radius: 3px 3px 0 0;
    background: var(--nd-accent);
  }
}

.serverBadge,
.accountBadge {
  position: absolute;
  width: 14px;
  height: 14px;
  border-radius: 50%;
  overflow: hidden;
  border: 1.5px solid var(--nd-navBg);
  background: var(--nd-navBg);
  display: flex;
  align-items: center;
  justify-content: center;
}

.serverBadge {
  top: 5px;
  right: calc(50% - 16px);
}

.accountBadge {
  bottom: 4px;
  left: calc(50% - 16px);
}

.badgeImg {
  width: 100%;
  height: 100%;
  object-fit: cover;
  border-radius: 50%;
}

.badgeInitial {
  font-size: 7px;
  font-weight: bold;
  line-height: 1;
  color: var(--nd-fg);
  opacity: 0.7;
}

</style>
