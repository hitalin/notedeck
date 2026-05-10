import type { Command } from '@/commands/registry'
import {
  ensureMemosLoaded,
  loadAllMemos,
  type StoredMemo,
} from '@/composables/useMemos'
import { useAccountsStore } from '@/stores/accounts'

/**
 * memos.read 系 capability (#492) — AI がローカルメモを「列挙 / 検索」する
 * 軽量 read capability。embedding は使わず substring + recency boost で
 * 80% カバー (= キーワード検索を AI のクエリ書換えに任せる方針)。
 *
 * 全 capability cheap=true (= ローカルメモリのみ、API 呼び出しなし)。
 * permissions: ['memos.read'] — readonly preset でもデフォルト許可。
 */

const DEFAULT_LIMIT = 10
const MAX_LIMIT = 50

interface ProjectedMemoRow {
  id: string
  text: string
  updatedAt: string
  tags?: string[]
}

function pickString(input: unknown): string | undefined {
  if (typeof input !== 'string') return undefined
  const t = input.trim()
  return t.length > 0 ? t : undefined
}

function clampLimit(input: unknown, fallback = DEFAULT_LIMIT): number {
  if (typeof input !== 'number' || !Number.isFinite(input)) return fallback
  return Math.max(1, Math.min(MAX_LIMIT, Math.floor(input)))
}

function pickPositiveNumber(input: unknown): number | undefined {
  if (typeof input !== 'number' || !Number.isFinite(input)) return undefined
  if (input <= 0) return undefined
  return input
}

function resolveAccountId(input: unknown): string {
  const explicit = pickString(input)
  if (explicit) return explicit
  const active = useAccountsStore().activeAccountId
  if (!active) {
    throw new Error(
      'memos: no active account (sign in first or supply accountId)',
    )
  }
  return active
}

function projectRow(memoKey: string, memo: StoredMemo): ProjectedMemoRow {
  const row: ProjectedMemoRow = {
    id: memoKey,
    text: memo.data.text,
    updatedAt: memo.updatedAt,
  }
  if (memo.data.tags.length > 0) row.tags = memo.data.tags
  return row
}

function compareUpdatedAtDesc(a: StoredMemo, b: StoredMemo): number {
  if (a.updatedAt < b.updatedAt) return 1
  if (a.updatedAt > b.updatedAt) return -1
  return 0
}

const ACCOUNT_ID_PARAM_DESC =
  'どのアカウントのメモ空間を参照するか。未指定なら active アカウント。'

/** `memos.list` — tag / 日付 / キーワードで絞り込んでメモを列挙 */
export const memosListCapability: Command = {
  id: 'memos.list',
  label: 'メモを列挙',
  icon: 'ti-list',
  category: 'general',
  shortcuts: [],
  aiTool: true,
  permissions: ['memos.read'],
  signature: {
    description:
      'NoteDeck のローカル memo を絞り込んで列挙する。' +
      ' tag / 経過日数 / 部分一致クエリでフィルタ可能。' +
      ' updatedAt 降順、limit 件で打ち切り (default 10、最大 50)。' +
      ' AI は memos.search でキーワード検索する前に memos.list で全体像を' +
      ' 把握するのが効率的。',
    params: {
      tag: {
        type: 'string',
        description: '指定すると tags にこの値が含まれるメモのみ返す',
        optional: true,
      },
      olderThanDays: {
        type: 'number',
        description:
          '指定日数以上前に更新されたメモのみ返す (整理候補の発見に使える)',
        optional: true,
      },
      query: {
        type: 'string',
        description: '本文に含まれる文字列 (大小無視の単純 substring 一致)',
        optional: true,
      },
      limit: {
        type: 'number',
        description: '返す最大件数 (default 10、最大 50)',
        optional: true,
      },
      accountId: {
        type: 'string',
        description: ACCOUNT_ID_PARAM_DESC,
        optional: true,
      },
    },
    returns: {
      type: 'array',
      description:
        '`{ id, text, updatedAt, tags? }` の配列。空配列なら一致なし',
    },
    cheap: true,
  },
  visible: false,
  execute: async (params) => {
    await ensureMemosLoaded()
    const accountId = resolveAccountId(params?.accountId)
    const tag = pickString(params?.tag)
    const olderThanDays = pickPositiveNumber(params?.olderThanDays)
    const queryRaw = pickString(params?.query)
    const queryLower = queryRaw?.toLowerCase()
    const limit = clampLimit(params?.limit)

    const olderThanIso = olderThanDays
      ? new Date(Date.now() - olderThanDays * 86_400_000).toISOString()
      : null

    const all = loadAllMemos(accountId)
    const entries: Array<[string, StoredMemo]> = Object.entries(all)
    const filtered = entries.filter(([, memo]) => {
      if (tag && !memo.data.tags.includes(tag)) return false
      if (olderThanIso && memo.updatedAt > olderThanIso) return false
      if (queryLower && !memo.data.text.toLowerCase().includes(queryLower)) {
        return false
      }
      return true
    })
    filtered.sort(([, a], [, b]) => compareUpdatedAtDesc(a, b))
    return filtered.slice(0, limit).map(([key, memo]) => projectRow(key, memo))
  },
}

/** `memos.search` — 部分一致 + recency boost で本文検索 */
export const memosSearchCapability: Command = {
  id: 'memos.search',
  label: 'メモを検索',
  icon: 'ti-search',
  category: 'general',
  shortcuts: [],
  aiTool: true,
  permissions: ['memos.read'],
  signature: {
    description:
      'NoteDeck のローカル memo を本文部分一致で検索する。' +
      ' 大小無視の substring + 直近更新の recency boost で並べ、' +
      ' limit 件 (default 10、最大 50) を返す。embedding 由来の semantic' +
      ' 検索はないので、ヒットしない場合は AI が言い換え (例:「旅行」→' +
      '「出張」「バカンス」) で再試行することを想定。',
    params: {
      query: {
        type: 'string',
        description: '検索文字列 (空文字不可、大小無視の部分一致)',
      },
      limit: {
        type: 'number',
        description: '返す最大件数 (default 10、最大 50)',
        optional: true,
      },
      accountId: {
        type: 'string',
        description: ACCOUNT_ID_PARAM_DESC,
        optional: true,
      },
    },
    returns: {
      type: 'array',
      description: '`{ id, text, updatedAt, tags? }` の配列',
    },
    cheap: true,
  },
  visible: false,
  execute: async (params) => {
    await ensureMemosLoaded()
    const query = pickString(params?.query)
    if (!query) throw new Error('memos.search: query is required')
    const limit = clampLimit(params?.limit)
    const accountId = resolveAccountId(params?.accountId)
    const queryLower = query.toLowerCase()

    const all = loadAllMemos(accountId)
    const entries: Array<[string, StoredMemo]> = Object.entries(all)
    const hits = entries.filter(([, memo]) =>
      memo.data.text.toLowerCase().includes(queryLower),
    )
    // recency boost: 単純に updatedAt 降順 (= 新しいほど上位)。
    // 本格的な BM25 / TF-IDF はオーバーキル、まず使い始めて必要なら拡張。
    hits.sort(([, a], [, b]) => compareUpdatedAtDesc(a, b))
    return hits.slice(0, limit).map(([key, memo]) => projectRow(key, memo))
  },
}

export const MEMOS_READ_BUILTIN_CAPABILITIES: readonly Command[] = [
  memosListCapability,
  memosSearchCapability,
]
