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

const mobileNavRef = ref<HTMLElement | null>(null)

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
  lookup: 'world-search',
  serverInfo: 'server',
  ads: 'ad-2',
  aboutMisskey: 'info-circle',
  emoji: 'mood-smile',
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
  <nav class="mobile-nav">
    <button
      class="_button mobile-tab mobile-menu-btn"
      @click="emit('toggle-drawer')"
    >
      <i class="ti ti-menu-2" />
    </button>
    <div ref="mobileNavRef" class="mobile-tabs-scroll">
      <button
        v-for="(colId, i) in visibleColumns"
        :key="colId"
        class="_button mobile-tab"
        :class="{ active: activeColumnIndex === i }"
        @click="emit('scroll-to-column', i)"
      >
        <i :class="'ti ti-' + columnIcon(colId)" />
        <span v-if="columnServerIcon(colId)" class="tab-server-badge">
          <img :src="columnServerIcon(colId)!" class="tab-badge-img" />
        </span>
        <span v-else-if="columnAccount(colId)" class="tab-server-badge">
          <span class="tab-badge-initial">{{
            columnAccount(colId)!.host.charAt(0).toUpperCase()
          }}</span>
        </span>
        <span v-if="columnAccount(colId)" class="tab-account-badge">
          <img
            v-if="columnAccount(colId)!.avatarUrl"
            :src="columnAccount(colId)!.avatarUrl!"
            class="tab-badge-img"
          />
          <span v-else class="tab-badge-initial">{{
            columnAccount(colId)!.username.charAt(0).toUpperCase()
          }}</span>
        </span>
      </button>
    </div>
    <button
      class="_button mobile-tab mobile-add-btn"
      title="Add column"
      @click="emit('toggle-add-menu')"
    >
      <i class="ti ti-plus" />
    </button>
  </nav>
</template>

<style scoped>
.mobile-nav {
  display: none;
}

@media (max-width: 500px) {
  .mobile-menu-btn,
  .mobile-add-btn {
    flex: 0 0 auto !important;
    width: 50px;
  }

  .mobile-nav {
    display: flex;
    align-items: stretch;
    flex: 0 0 auto;
    height: 50px;
    padding-bottom: var(--nd-safe-area-bottom, env(safe-area-inset-bottom));
    background: color-mix(in srgb, var(--nd-navBg) 80%, transparent);
    backdrop-filter: blur(15px);
    -webkit-backdrop-filter: blur(15px);
    border-top: 1px solid var(--nd-divider);
  }

  .mobile-tabs-scroll {
    display: flex;
    align-items: stretch;
    justify-content: space-evenly;
    flex: 1;
    min-width: 0;
    overflow-x: auto;
    overflow-y: hidden;
    -webkit-overflow-scrolling: touch;
    scrollbar-width: none;
  }

  .mobile-tabs-scroll::-webkit-scrollbar {
    display: none;
  }

  .mobile-tab {
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
    flex: 0 0 auto;
    min-width: 50px;
    min-height: 50px;
    padding: 0 8px;
    font-size: 20px;
    color: var(--nd-fg);
    opacity: 0.45;
    transition: opacity 0.2s, color 0.2s;
  }

  .mobile-tab.active {
    opacity: 1;
    color: var(--nd-accent);
  }

  .mobile-tab.active::after {
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

  .mobile-tab:active {
    opacity: 0.7;
    transform: scale(0.9);
    transition: opacity 0.1s, color 0.2s, transform 0.1s;
  }

  .tab-server-badge,
  .tab-account-badge {
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

  .tab-server-badge {
    top: 5px;
    right: calc(50% - 16px);
  }

  .tab-account-badge {
    bottom: 4px;
    left: calc(50% - 16px);
  }

  .tab-badge-img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    border-radius: 50%;
  }

  .tab-badge-initial {
    font-size: 7px;
    font-weight: bold;
    line-height: 1;
    color: var(--nd-fg);
    opacity: 0.7;
  }
}
</style>
