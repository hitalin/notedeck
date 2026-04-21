import type { Component } from 'vue'
import { defineAsyncComponent } from 'vue'
import type { ColumnType, DeckColumn } from '@/stores/deck'
import { commands, unwrap } from '@/utils/tauriInvoke'

export type ColumnGroup = 'account' | 'server' | 'tool'

export interface SelectableItem {
  id: string
  name: string
  avatarUrl?: string
}

export interface SelectableSpec {
  /** DeckColumn 上の ID キー (listId, antennaId, channelId, clipId, userId) */
  idKey: keyof DeckColumn
  /** アイテム一覧取得 */
  fetch: (accountId: string) => Promise<SelectableItem[]>
  /** サーバー側検索 (対応するタイプのみ) */
  search?: (accountId: string, query: string) => Promise<SelectableItem[]>
  /** Misskey API の作成エンドポイント (例: 'clips/create') */
  createEndpoint?: string
  /** 作成時のデフォルト params */
  createDefaults?: Record<string, unknown>
  /** 選択されたアイテムからカラム名を派生 (既定: item.name) */
  formatName?: (item: SelectableItem) => string
}

export interface ColumnSpec {
  label: string
  icon: string
  group: ColumnGroup
  /** 認証不要で追加可能 (ゲスト/匿名 OK) */
  guestAllowed?: boolean
  /** accountId: null で横断するカラムを許可 */
  crossAccount?: boolean
  /** アカウント選択画面を必ず出す (「なし」も選べる) */
  accountOptional?: boolean
  /** アカウント選択をスキップし accountId=null で追加 */
  accountIndependent?: boolean
  /** PiP ウィンドウ化が可能 (既定: true。false を明示して opt-out) */
  pipEnabled?: boolean
  /** ワイドカラム対応 (最大幅 1200px) */
  wide?: boolean
  /** 追加時のデフォルト幅 (既定: 360) */
  defaultWidth?: number
  /** 追加時にマージされる extra props */
  defaultProps?: Partial<Omit<DeckColumn, 'id' | 'type'>>
  /** 非同期コンポーネントローダー */
  component: () => Promise<{ default: Component }>
  /** list/antenna/channel/clip/user のような選択式タイプ */
  selectable?: SelectableSpec
}

// biome-ignore lint/suspicious/noExplicitAny: bindings の Result<T, E> と SelectableItem の橋渡し
const unwrapItems = (result: any): SelectableItem[] =>
  unwrap(result) as unknown as SelectableItem[]

/**
 * カラム種別の Single Source of Truth。
 * UI 表示順はこのオブジェクトの宣言順を用いる (group ごとに抽出)。
 */
export const COLUMN_REGISTRY: Record<ColumnType, ColumnSpec> = {
  // ============================================================
  // アカウント系
  // ============================================================
  timeline: {
    label: 'タイムライン',
    icon: 'home',
    group: 'account',
    defaultProps: { tl: 'home', name: null },
    component: () => import('@/components/deck/DeckTimelineColumn.vue'),
  },
  notifications: {
    label: '通知',
    icon: 'bell',
    group: 'account',
    crossAccount: true,
    component: () => import('@/components/deck/DeckNotificationColumn.vue'),
  },
  drive: {
    label: 'ドライブ',
    icon: 'cloud',
    group: 'account',
    component: () => import('@/components/deck/DeckDriveColumn.vue'),
  },
  followRequests: {
    label: 'フォローリクエスト',
    icon: 'user-plus',
    group: 'account',
    crossAccount: true,
    component: () => import('@/components/deck/DeckFollowRequestsColumn.vue'),
  },
  list: {
    label: 'リスト',
    icon: 'list',
    group: 'account',
    component: () => import('@/components/deck/DeckListColumn.vue'),
    selectable: {
      idKey: 'listId',
      fetch: (aid) => commands.apiGetUserLists(aid).then(unwrapItems),
      createEndpoint: 'users/lists/create',
    },
  },
  antenna: {
    label: 'アンテナ',
    icon: 'antenna-bars-5',
    group: 'account',
    component: () => import('@/components/deck/DeckAntennaColumn.vue'),
    selectable: {
      idKey: 'antennaId',
      fetch: (aid) => commands.apiGetAntennas(aid).then(unwrapItems),
      createEndpoint: 'antennas/create',
      createDefaults: {
        src: 'all',
        keywords: [['']],
        excludeKeywords: [['']],
        users: [],
        caseSensitive: false,
        withReplies: false,
        withFile: false,
      },
    },
  },
  favorites: {
    label: 'お気に入り',
    icon: 'star',
    group: 'account',
    component: () => import('@/components/deck/DeckFavoritesColumn.vue'),
  },
  clip: {
    label: 'クリップ',
    icon: 'paperclip',
    group: 'account',
    component: () => import('@/components/deck/DeckClipColumn.vue'),
    selectable: {
      idKey: 'clipId',
      fetch: (aid) => commands.apiGetClips(aid).then(unwrapItems),
      createEndpoint: 'clips/create',
    },
  },
  mentions: {
    label: 'メンション',
    icon: 'at',
    group: 'account',
    crossAccount: true,
    component: () => import('@/components/deck/DeckMentionsColumn.vue'),
  },
  specified: {
    label: 'ダイレクト',
    icon: 'mail',
    group: 'account',
    crossAccount: true,
    component: () => import('@/components/deck/DeckMentionsColumn.vue'),
  },
  chat: {
    label: 'チャット',
    icon: 'messages',
    group: 'account',
    crossAccount: true,
    component: () => import('@/components/deck/DeckChatColumn.vue'),
  },
  achievements: {
    label: '実績',
    icon: 'medal',
    group: 'account',
    component: () => import('@/components/deck/DeckAchievementsColumn.vue'),
  },

  // ============================================================
  // サーバー系
  // ============================================================
  serverInfo: {
    label: 'サーバー情報',
    icon: 'server',
    group: 'server',
    guestAllowed: true,
    component: () => import('@/components/deck/DeckServerInfoColumn.vue'),
  },
  aboutMisskey: {
    label: 'Misskeyについて',
    icon: 'info-circle',
    group: 'server',
    guestAllowed: true,
    component: () => import('@/components/deck/DeckAboutMisskeyColumn.vue'),
  },
  emoji: {
    label: 'カスタム絵文字',
    icon: 'mood-smile',
    group: 'server',
    guestAllowed: true,
    component: () => import('@/components/deck/DeckEmojiColumn.vue'),
  },
  ads: {
    label: '広告',
    icon: 'ad-2',
    group: 'server',
    guestAllowed: true,
    component: () => import('@/components/deck/DeckAdsColumn.vue'),
  },
  explore: {
    label: 'みつける',
    icon: 'compass',
    group: 'server',
    guestAllowed: true,
    component: () => import('@/components/deck/DeckExploreColumn.vue'),
  },
  announcements: {
    label: 'お知らせ',
    icon: 'speakerphone',
    group: 'server',
    guestAllowed: true,
    component: () => import('@/components/deck/DeckAnnouncementsColumn.vue'),
  },
  search: {
    label: '検索',
    icon: 'search',
    group: 'server',
    guestAllowed: true,
    crossAccount: true,
    component: () => import('@/components/deck/DeckSearchColumn.vue'),
  },
  lookup: {
    label: '照会',
    icon: 'world-search',
    group: 'server',
    guestAllowed: true,
    crossAccount: true,
    component: () => import('@/components/deck/DeckLookupColumn.vue'),
  },
  channel: {
    label: 'チャンネル',
    icon: 'device-tv',
    group: 'server',
    guestAllowed: true,
    component: () => import('@/components/deck/DeckChannelColumn.vue'),
    selectable: {
      idKey: 'channelId',
      fetch: (aid) => commands.apiGetChannels(aid).then(unwrapItems),
      search: (aid, q) => commands.apiSearchChannels(aid, q).then(unwrapItems),
    },
  },
  gallery: {
    label: 'ギャラリー',
    icon: 'icons',
    group: 'server',
    guestAllowed: true,
    component: () => import('@/components/deck/DeckGalleryColumn.vue'),
  },
  play: {
    label: 'Misskey Play',
    icon: 'player-play',
    group: 'server',
    guestAllowed: true,
    component: () => import('@/components/deck/DeckPlayColumn.vue'),
  },
  page: {
    label: 'ページ',
    icon: 'note',
    group: 'server',
    guestAllowed: true,
    component: () => import('@/components/deck/DeckPageColumn.vue'),
  },
  user: {
    label: 'ユーザー',
    icon: 'user',
    group: 'server',
    guestAllowed: true,
    component: () => import('@/components/deck/DeckUserColumn.vue'),
    selectable: {
      idKey: 'userId',
      fetch: (aid) =>
        commands.apiSearchUsersByQuery(aid, '', null).then(unwrapItems),
      search: (aid, q) =>
        commands.apiSearchUsersByQuery(aid, q, null).then(unwrapItems),
      formatName: (item) => item.name,
    },
  },
  charts: {
    label: 'チャート',
    icon: 'chart-line',
    group: 'server',
    guestAllowed: true,
    component: () => import('@/components/deck/DeckChartsColumn.vue'),
  },
  federation: {
    label: '連合',
    icon: 'planet',
    group: 'server',
    guestAllowed: true,
    component: () => import('@/components/deck/DeckFederationColumn.vue'),
  },

  // ============================================================
  // ツール系
  // ============================================================
  widget: {
    label: 'ウィジェット',
    icon: 'app-window',
    group: 'tool',
    guestAllowed: true,
    accountOptional: true,
    defaultProps: { widgets: [] },
    component: () => import('@/components/deck/DeckWidgetColumn.vue'),
  },
  pluginManager: {
    label: 'プラグイン',
    icon: 'puzzle',
    group: 'tool',
    guestAllowed: true,
    accountIndependent: true,
    defaultProps: { accountId: null },
    component: () => import('@/components/deck/DeckPluginManagerColumn.vue'),
  },
  aiscript: {
    label: 'スクラッチパッド',
    icon: 'terminal-2',
    group: 'tool',
    guestAllowed: true,
    accountOptional: true,
    defaultProps: { aiscriptCode: '<: "Hello, AiScript!"' },
    component: () => import('@/components/deck/DeckAiScriptColumn.vue'),
  },
  apiConsole: {
    label: 'APIコンソール',
    icon: 'api',
    group: 'tool',
    component: () => import('@/components/deck/DeckApiConsoleColumn.vue'),
  },
  apiDocs: {
    label: 'APIドキュメント',
    icon: 'file-description',
    group: 'tool',
    guestAllowed: true,
    accountIndependent: true,
    wide: true,
    defaultWidth: 990,
    defaultProps: { accountId: null },
    component: () => import('@/components/deck/DeckApiDocsColumn.vue'),
  },
  streamInspector: {
    label: 'ストリーム',
    icon: 'activity-heartbeat',
    group: 'tool',
    crossAccount: true,
    wide: true,
    component: () => import('@/components/deck/DeckStreamInspectorColumn.vue'),
  },
  ai: {
    label: 'AIチャット',
    icon: 'sparkles',
    group: 'tool',
    accountIndependent: true,
    defaultProps: { accountId: null },
    component: () => import('@/components/deck/DeckAiColumn.vue'),
  },
  memos: {
    label: 'メモ',
    icon: 'notes',
    group: 'tool',
    guestAllowed: true,
    component: () => import('@/components/deck/DeckMemoColumn.vue'),
  },
  taskRunner: {
    label: 'タスク',
    icon: 'player-play',
    group: 'tool',
    guestAllowed: true,
    accountIndependent: true,
    defaultProps: { accountId: null },
    component: () => import('@/components/deck/DeckTaskRunnerColumn.vue'),
  },
}

// ============================================================
// 派生ヘルパー
// ============================================================

/** Registry 宣言順の全カラムタイプ */
export const ALL_COLUMN_TYPES = Object.keys(
  COLUMN_REGISTRY,
) as readonly ColumnType[]

export function isColumnType(value: unknown): value is ColumnType {
  return typeof value === 'string' && value in COLUMN_REGISTRY
}

export const COLUMN_LABELS: Record<string, string> = Object.fromEntries(
  ALL_COLUMN_TYPES.map((t) => [t, COLUMN_REGISTRY[t].label]),
)

export const COLUMN_ICONS: Record<string, string> = Object.fromEntries(
  ALL_COLUMN_TYPES.map((t) => [t, COLUMN_REGISTRY[t].icon]),
)

function typesWithFlag(
  flag:
    | 'guestAllowed'
    | 'crossAccount'
    | 'accountOptional'
    | 'accountIndependent'
    | 'wide',
): Set<ColumnType> {
  return new Set(ALL_COLUMN_TYPES.filter((t) => COLUMN_REGISTRY[t][flag]))
}

export const GUEST_ALLOWED_TYPES = typesWithFlag('guestAllowed')
export const CROSS_ACCOUNT_TYPES = typesWithFlag('crossAccount')
export const ACCOUNT_OPTIONAL_TYPES = typesWithFlag('accountOptional')
export const ACCOUNT_INDEPENDENT_TYPES = typesWithFlag('accountIndependent')
export const WIDE_COLUMN_TYPES = typesWithFlag('wide')

/** pipEnabled は既定 true。false を明示したカラムのみ除外する。 */
export const PIP_ENABLED_TYPES: ReadonlySet<ColumnType> = new Set(
  ALL_COLUMN_TYPES.filter((t) => COLUMN_REGISTRY[t].pipEnabled !== false),
)

export interface ColumnGroupInfo {
  group: ColumnGroup
  label: string
  icon: string
  types: ColumnType[]
}

/** AddColumnDialog / コマンドパレット双方が使う UI グループ定義 */
export const COLUMN_TYPE_GROUPS: ColumnGroupInfo[] = (() => {
  const mk = (
    group: ColumnGroup,
    label: string,
    icon: string,
  ): ColumnGroupInfo => ({
    group,
    label,
    icon,
    types: ALL_COLUMN_TYPES.filter((t) => COLUMN_REGISTRY[t].group === group),
  })
  return [
    mk('account', 'アカウント', 'user'),
    mk('server', 'サーバー', 'server'),
    mk('tool', 'ツール', 'tool'),
  ]
})()

/** Vue コンポーネントマップ (PipPage / DeckColumnsArea から参照) */
export const COLUMN_COMPONENTS: Record<string, Component> = Object.fromEntries(
  ALL_COLUMN_TYPES.map((t) => [
    t,
    defineAsyncComponent(COLUMN_REGISTRY[t].component),
  ]),
)

/**
 * カラム追加時の共通デフォルト。呼び出し側は type/accountId を指定するだけでよい。
 * `defaultProps` が `accountId` を含む場合はそれが優先される (accountIndependent 用)。
 */
export function buildColumnDefaults(
  type: ColumnType,
  accountId: string | null,
): Omit<DeckColumn, 'id' | 'type'> {
  const spec = COLUMN_REGISTRY[type]
  return {
    name: spec.label,
    width: spec.defaultWidth ?? 360,
    accountId,
    active: true,
    ...spec.defaultProps,
  }
}
