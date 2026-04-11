import { computed, nextTick, type Ref, watch } from 'vue'
import type { DeckColumn } from '@/stores/deck'

export const COLUMN_ICONS: Record<string, string> = {
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
  streamInspector: 'activity-heartbeat',
  pluginManager: 'puzzle',
}

export const COLUMN_LABELS: Record<string, string> = {
  timeline: 'タイムライン',
  notifications: '通知',
  search: '検索',
  list: 'リスト',
  antenna: 'アンテナ',
  favorites: 'お気に入り',
  clip: 'クリップ',
  channel: 'チャンネル',
  user: 'ユーザー',
  mentions: 'メンション',
  specified: 'ダイレクト',
  chat: 'チャット',
  widget: 'ウィジェット',
  aiscript: 'スクラッチパッド',
  play: 'Misskey Play',
  page: 'ページ',
  ai: 'AIチャット',
  announcements: 'お知らせ',
  drive: 'ドライブ',
  explore: 'みつける',
  gallery: 'ギャラリー',
  followRequests: 'フォローリクエスト',
  achievements: '実績',
  apiConsole: 'APIコンソール',
  apiDocs: 'APIドキュメント',
  lookup: '照会',
  serverInfo: 'サーバー情報',
  ads: '広告',
  aboutMisskey: 'Misskeyについて',
  emoji: 'カスタム絵文字',
  streamInspector: 'ストリーム',
  pluginManager: 'プラグイン',
}

export const TL_ICONS: Record<string, string> = {
  home: 'home',
  local: 'planet',
  social: 'rocket',
  global: 'whirl',
}

export function useColumnTabs(
  columns: () => DeckColumn[],
  layout: () => string[][],
  activeColumnIndex: () => number,
  scrollContainerRef: Ref<HTMLElement | null | undefined>,
) {
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

  function columnIcon(colId: string): string {
    const col = columnMap.value.get(colId)
    if (!col) return COLUMN_ICONS.timeline ?? ''
    if (col.type === 'timeline' && col.tl) {
      return TL_ICONS[col.tl] ?? COLUMN_ICONS.timeline ?? ''
    }
    return COLUMN_ICONS[col.type] ?? COLUMN_ICONS.timeline ?? ''
  }

  function columnType(colId: string): string {
    const col = columnMap.value.get(colId)
    return col?.type ?? 'timeline'
  }

  function columnAccountId(colId: string): string | null {
    const col = columnMap.value.get(colId)
    return col?.accountId ?? null
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
    columnType,
    columnIcon,
    columnAccountId,
  }
}
