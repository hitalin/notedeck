import type { Command } from '@/commands/registry'
import type { ColumnType } from '@/stores/deck'
import { useDeckStore } from '@/stores/deck'

/**
 * AI が `column.add` で渡せるカラム種別。複雑な設定を要するカラム
 * (channel / list / antenna / play / aiscript 等の追加 ID 必須型) は
 * 一旦除外し、引数なしで開けるシンプルなものだけホワイトリスト化する。
 * 必要に応じて拡張する。
 */
const ADDABLE_COLUMN_TYPES: readonly ColumnType[] = [
  'timeline',
  'notifications',
  'mentions',
  'specified',
  'search',
  'favorites',
  'drive',
  'gallery',
  'explore',
  'memos',
  'charts',
  'federation',
  'aboutMisskey',
  'announcements',
  'achievements',
  'followRequests',
  'apiConsole',
  'apiDocs',
  'lookup',
  'serverInfo',
  'streamInspector',
  'pluginManager',
  'themeManager',
  'taskRunner',
  'skill',
  'ai',
  'chat',
  'emoji',
  'ads',
] as const

/**
 * `column.list` — 現在のデッキに存在するカラム一覧を返す。
 * AI が「このユーザーは今どのカラムを開いているか」を理解できる。
 */
export const columnListCapability: Command = {
  id: 'column.list',
  label: 'カラム一覧',
  icon: 'ti-columns',
  category: 'column',
  shortcuts: [],
  aiTool: true,
  permissions: [],
  signature: {
    description:
      '現在開かれているカラムを配列で返す。各要素は { id, type, name, accountId } 等を含む。',
    params: {},
    returns: {
      type: 'array',
      description: 'DeckColumn の配列',
    },
  },
  visible: false,
  execute: () => {
    return useDeckStore().columns.map((c) => ({
      id: c.id,
      type: c.type,
      name: c.name,
      accountId: c.accountId,
    }))
  },
}

/**
 * `column.add` — 新しいカラムをデッキに追加する。
 * AI が「ノートのカラムを追加して」と頼まれたときに呼ぶ。
 * 引数で取れる type はホワイトリスト方式 (= channel / list 等の追加
 * 設定が必須なカラムは除外)。
 */
export const columnAddCapability: Command = {
  id: 'column.add',
  label: 'カラムを追加',
  icon: 'ti-plus',
  category: 'column',
  shortcuts: [],
  aiTool: true,
  permissions: [],
  signature: {
    description:
      '新しいカラムをデッキに追加する。type で種別を指定する。' +
      ' channel / list / antenna 等の追加設定が必要なカラムは未対応。',
    params: {
      type: {
        type: 'string',
        description: '追加するカラムの種別',
        enum: ADDABLE_COLUMN_TYPES,
      },
      name: {
        type: 'string',
        description: 'カラムのタイトル (空または省略時は自動)',
        optional: true,
      },
    },
    returns: {
      type: 'object',
      description: '追加されたカラムの { id, type }',
    },
  },
  visible: false,
  execute: (params) => {
    const type = typeof params?.type === 'string' ? params.type : ''
    if (!ADDABLE_COLUMN_TYPES.includes(type as ColumnType)) {
      throw new Error(
        `Unsupported column type "${type}". ` +
          `Supported: ${ADDABLE_COLUMN_TYPES.join(', ')}`,
      )
    }
    const name = typeof params?.name === 'string' ? params.name : null
    const col = useDeckStore().addColumn({
      type: type as ColumnType,
      name,
      width: 380,
      accountId: null,
    })
    return { id: col.id, type: col.type }
  },
}

export const COLUMN_BUILTIN_CAPABILITIES: readonly Command[] = [
  columnListCapability,
  columnAddCapability,
]
