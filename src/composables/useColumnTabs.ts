import { computed, nextTick, type Ref, watch } from 'vue'
import { useAccountsStore } from '@/stores/accounts'
import type { DeckColumn } from '@/stores/deck'
import { useServersStore } from '@/stores/servers'

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
}

const TL_ICONS: Record<string, string> = {
  home: 'home',
  local: 'planet',
  social: 'rocket',
  global: 'whirl',
}

export function useColumnTabs(
  columns: () => DeckColumn[],
  layout: () => string[][],
  activeColumnIndex: () => number,
  scrollContainerRef: Ref<HTMLElement | null>,
) {
  const accountsStore = useAccountsStore()
  const serversStore = useServersStore()

  const columnMap = computed(() => {
    const map = new Map<string, DeckColumn>()
    for (const col of columns()) {
      map.set(col.id, col)
    }
    return map
  })

  const visibleGroups = computed(() =>
    layout().filter((group) => group.some((id) => columnMap.value.has(id))),
  )

  function groupPrimaryId(group: string[]): string {
    return group.find((id) => columnMap.value.has(id)) ?? group[0] ?? ''
  }

  const hasMultipleAccounts = computed(() => accountsStore.accounts.length > 1)

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

  watch(activeColumnIndex, () => {
    nextTick(() => {
      if (!scrollContainerRef.value) return
      const tab = scrollContainerRef.value.children[activeColumnIndex()] as
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
  })

  return {
    visibleGroups,
    groupPrimaryId,
    columnIcon,
    columnAccount,
    columnServerIcon,
  }
}
