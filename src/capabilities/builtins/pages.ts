import { initAdapterFor } from '@/adapters/factory'
import type { ApiAdapter, PagesEndpoint } from '@/adapters/types'
import type { Command } from '@/commands/registry'
import { useAccountsStore } from '@/stores/accounts'

/**
 * Pages (Misskey Pages) 系 capability。Misskey の長文記事 / wiki 機能。
 *
 * read-only のみ提供。like / unlike は副作用ありで本 PR では除外する
 * (Misskey 本家でも「いいね」相当は記事作者へ通知が飛ぶ)。
 *
 * permission: `account.read`。情報源として AI に開放することで、ユーザーが
 * 書いた wiki / 自分が like した記事を AI が引用 / 要約 / 検索できる。
 */

const VALID_PAGES_ENDPOINTS: readonly PagesEndpoint[] = [
  'pages/featured',
  'i/pages',
  'i/page-likes',
] as const

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

function pickString(v: unknown): string | undefined {
  if (typeof v !== 'string') return undefined
  const t = v.trim()
  return t.length > 0 ? t : undefined
}

function pickNumber(v: unknown): number | undefined {
  if (typeof v !== 'number' || !Number.isFinite(v)) return undefined
  return v
}

const ACCOUNT_ID_PARAM_DESC =
  'どのアカウントで取得するか。未指定なら active アカウント。'

export const pagesListCapability: Command = {
  id: 'pages.list',
  label: 'Pages 一覧',
  icon: 'ti-news',
  category: 'note',
  shortcuts: [],
  aiTool: true,
  permissions: ['account.read'],
  signature: {
    description:
      'Misskey Pages 一覧を返す。endpoint で範囲を切替:' +
      ' `pages/featured` (注目記事) / `i/pages` (自分の記事) /' +
      ' `i/page-likes` (自分が like した記事)。read-only。',
    params: {
      endpoint: {
        type: 'string',
        description: '対象 endpoint',
        enum: VALID_PAGES_ENDPOINTS,
      },
      limit: {
        type: 'number',
        description: '取得件数 (default 30, 1-100)',
        optional: true,
      },
      accountId: {
        type: 'string',
        description: ACCOUNT_ID_PARAM_DESC,
        optional: true,
      },
    },
    returns: { type: 'array', description: 'Page の配列' },
    cheap: true,
  },
  visible: false,
  execute: async (params) => {
    const endpoint = pickString(params?.endpoint)
    if (!endpoint) throw new Error('pages.list: endpoint is required')
    if (!(VALID_PAGES_ENDPOINTS as readonly string[]).includes(endpoint)) {
      throw new Error(
        `pages.list: invalid endpoint "${endpoint}". Valid: ${VALID_PAGES_ENDPOINTS.join(', ')}`,
      )
    }
    const limit = pickNumber(params?.limit)
    const accountId = pickString(params?.accountId)
    const api = await getApiAdapter(accountId)
    return await api.getPages(endpoint as PagesEndpoint, limit)
  },
}

export const pagesShowCapability: Command = {
  id: 'pages.show',
  label: 'Page 詳細',
  icon: 'ti-file-text',
  category: 'note',
  shortcuts: [],
  aiTool: true,
  permissions: ['account.read'],
  signature: {
    description:
      '指定 pageId の Misskey Page 詳細を返す (本文・ブロック含む)。' +
      ' pages.list で取得した id を渡す。read-only。',
    params: {
      pageId: { type: 'string', description: '対象 pageId' },
      accountId: {
        type: 'string',
        description: ACCOUNT_ID_PARAM_DESC,
        optional: true,
      },
    },
    returns: { type: 'object', description: 'Page 詳細 (Misskey 生 JSON)' },
  },
  visible: false,
  execute: async (params) => {
    const pageId = pickString(params?.pageId)
    if (!pageId) throw new Error('pages.show: pageId is required')
    const accountId = pickString(params?.accountId)
    const api = await getApiAdapter(accountId)
    return await api.getPage(pageId)
  },
}

export const PAGES_BUILTIN_CAPABILITIES: readonly Command[] = [
  pagesListCapability,
  pagesShowCapability,
]
