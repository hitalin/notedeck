import { initAdapterFor } from '@/adapters/factory'
import type { ApiAdapter, TimelineType } from '@/adapters/types'
import type { Command } from '@/commands/registry'
import { projectVisibleItems } from '@/composables/useAiSystemContext'
import { useAccountsStore } from '@/stores/accounts'

/**
 * AI が 1 回の capability 呼び出しで取得できるノートの上限。
 * Misskey API 自体の上限 (/notes/* 系は 100) と揃える。AI が「続き」を
 * 取りたいときは untilId 指定で再呼び出しすればページング可能。
 */
const MAX_NOTES_PER_CALL = 100
/** params.limit を省略 / 不正値だった場合のデフォルト件数 */
const DEFAULT_LIMIT = 10

const VALID_TIMELINE_TYPES: readonly TimelineType[] = [
  'home',
  'local',
  'social',
  'global',
] as const

/**
 * 現在 active なアカウント (params.accountId 指定時はそれ) の API adapter を
 * 取得する。adapter は `initAdapterFor` のグローバル cache 経由なので、複数
 * 呼び出しでも同じインスタンスが返る。
 */
async function getApiAdapter(
  accountId: string | undefined,
): Promise<ApiAdapter> {
  const store = useAccountsStore()
  const id = accountId ?? store.activeAccountId
  if (!id) throw new Error('No active account')
  const acc = store.accounts.find((a) => a.id === id)
  if (!acc) throw new Error(`Account "${id}" not found`)
  const { adapter } = await initAdapterFor(acc.host, acc.id)
  return adapter.api
}

function clampLimit(input: unknown, fallback = DEFAULT_LIMIT): number {
  if (typeof input !== 'number' || !Number.isFinite(input)) return fallback
  return Math.max(1, Math.min(MAX_NOTES_PER_CALL, Math.floor(input)))
}

function pickUntilId(input: unknown): string | undefined {
  if (typeof input !== 'string') return undefined
  const trimmed = input.trim()
  return trimmed.length > 0 ? trimmed : undefined
}

/** `notes.search` — Misskey の /notes/search 経由でキーワード検索 */
export const notesSearchCapability: Command = {
  id: 'notes.search',
  label: 'ノート検索',
  icon: 'ti-search',
  category: 'note',
  shortcuts: [],
  aiTool: true,
  permissions: ['notes.read'],
  signature: {
    description:
      'キーワードでノートを全文検索する。Misskey の /notes/search を使う。' +
      ' 結果は note projection (id / userId / username / text / createdAt) で返す。' +
      ' 100 件を超えて取得したい場合は、最後のノートの id を untilId に渡して再呼び出し。',
    params: {
      query: {
        type: 'string',
        description: '検索キーワード (空文字は不可)',
      },
      limit: {
        type: 'number',
        description: '取得件数 (1-100, default 10)',
        optional: true,
      },
      untilId: {
        type: 'string',
        description:
          'この ID より前のノートを取得 (ページング用)。前回呼び出しの最後のノートの id を渡す。',
        optional: true,
      },
    },
    returns: {
      type: 'array',
      description: 'ノート projection の配列',
    },
  },
  visible: false,
  execute: async (params) => {
    const query = typeof params?.query === 'string' ? params.query.trim() : ''
    if (!query) throw new Error('notes.search: query is required')
    const limit = clampLimit(params?.limit)
    const untilId = pickUntilId(params?.untilId)
    const api = await getApiAdapter(undefined)
    const notes = await api.searchNotes(query, { limit, untilId })
    return projectVisibleItems(notes, 'search', limit)
  },
}

/** `notes.timeline` — home / local / social / global タイムライン取得 */
export const notesTimelineCapability: Command = {
  id: 'notes.timeline',
  label: 'タイムライン取得',
  icon: 'ti-list',
  category: 'note',
  shortcuts: [],
  aiTool: true,
  permissions: ['notes.read'],
  signature: {
    description:
      'タイムラインを取得する。home はログイン中のフォロー含むホーム、' +
      ' local はサーバー内ローカル、social はホーム+ローカル混合、' +
      ' global は連合宇宙全体。' +
      ' 100 件を超えて取得したい場合は、最後のノートの id を untilId に渡して再呼び出し。',
    params: {
      type: {
        type: 'string',
        description: 'タイムラインの種類',
        enum: VALID_TIMELINE_TYPES,
      },
      limit: {
        type: 'number',
        description: '取得件数 (1-100, default 10)',
        optional: true,
      },
      untilId: {
        type: 'string',
        description:
          'この ID より前のノートを取得 (ページング用)。前回呼び出しの最後のノートの id を渡す。',
        optional: true,
      },
    },
    returns: {
      type: 'array',
      description: 'ノート projection の配列',
    },
  },
  visible: false,
  execute: async (params) => {
    const type = typeof params?.type === 'string' ? params.type : ''
    if (!VALID_TIMELINE_TYPES.includes(type as TimelineType)) {
      throw new Error(
        `notes.timeline: invalid type "${type}". Valid: ${VALID_TIMELINE_TYPES.join(', ')}`,
      )
    }
    const limit = clampLimit(params?.limit)
    const untilId = pickUntilId(params?.untilId)
    const api = await getApiAdapter(undefined)
    const notes = await api.getTimeline(type as TimelineType, {
      limit,
      untilId,
    })
    return projectVisibleItems(notes, 'timeline', limit)
  },
}

/** `notes.user` — 特定ユーザーの最近のノート取得 */
export const notesUserCapability: Command = {
  id: 'notes.user',
  label: 'ユーザーのノート取得',
  icon: 'ti-user',
  category: 'note',
  shortcuts: [],
  aiTool: true,
  permissions: ['notes.read'],
  signature: {
    description:
      '特定ユーザーの最近のノートを取得する。userId は Misskey の内部 ID' +
      ' (username ではなく)。' +
      ' 100 件を超えて取得したい場合は、最後のノートの id を untilId に渡して再呼び出し。',
    params: {
      userId: {
        type: 'string',
        description: 'Misskey の内部 user ID',
      },
      limit: {
        type: 'number',
        description: '取得件数 (1-100, default 10)',
        optional: true,
      },
      untilId: {
        type: 'string',
        description:
          'この ID より前のノートを取得 (ページング用)。前回呼び出しの最後のノートの id を渡す。',
        optional: true,
      },
    },
    returns: {
      type: 'array',
      description: 'ノート projection の配列',
    },
  },
  visible: false,
  execute: async (params) => {
    const userId =
      typeof params?.userId === 'string' ? params.userId.trim() : ''
    if (!userId) throw new Error('notes.user: userId is required')
    const limit = clampLimit(params?.limit)
    const untilId = pickUntilId(params?.untilId)
    const api = await getApiAdapter(undefined)
    const notes = await api.getUserNotes(userId, { limit, untilId })
    return projectVisibleItems(notes, 'user', limit)
  },
}

export const NOTES_BUILTIN_CAPABILITIES: readonly Command[] = [
  notesSearchCapability,
  notesTimelineCapability,
  notesUserCapability,
]
