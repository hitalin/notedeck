import { initAdapterFor } from '@/adapters/factory'
import type { ApiAdapter, FlashesEndpoint } from '@/adapters/types'
import type { Command } from '@/commands/registry'
import { useAccountsStore } from '@/stores/accounts'

/**
 * Flash (Misskey Play) 系 capability。Misskey の AiScript 小アプリ。
 *
 * read-only。flash.show は **AiScript ソース** を含むため、AI が既存 Play を
 * 学習素材として読んで再利用 / 改変 / 自前 widget へ移植する動線が成立する。
 *
 * permission: `account.read`。like / unlike / update は副作用ありで除外。
 */

const VALID_FLASH_ENDPOINTS: readonly FlashesEndpoint[] = [
  'flash/featured',
  'flash/my',
  'flash/my-likes',
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

export const flashListCapability: Command = {
  id: 'flash.list',
  label: 'Misskey Play 一覧',
  icon: 'ti-bolt',
  category: 'note',
  shortcuts: [],
  aiTool: true,
  permissions: ['account.read'],
  signature: {
    description:
      'Misskey Play (Flash) 一覧を返す。endpoint で範囲を切替:' +
      ' `flash/featured` (注目) / `flash/my` (自分の) / `flash/my-likes` (自分が like)。' +
      ' read-only。',
    params: {
      endpoint: {
        type: 'string',
        description: '対象 endpoint',
        enum: VALID_FLASH_ENDPOINTS,
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
    returns: { type: 'array', description: 'Flash の配列' },
    cheap: true,
  },
  visible: false,
  execute: async (params) => {
    const endpoint = pickString(params?.endpoint)
    if (!endpoint) throw new Error('flash.list: endpoint is required')
    if (!(VALID_FLASH_ENDPOINTS as readonly string[]).includes(endpoint)) {
      throw new Error(
        `flash.list: invalid endpoint "${endpoint}". Valid: ${VALID_FLASH_ENDPOINTS.join(', ')}`,
      )
    }
    const limit = pickNumber(params?.limit)
    const accountId = pickString(params?.accountId)
    const api = await getApiAdapter(accountId)
    return await api.getFlashes(endpoint as FlashesEndpoint, limit)
  },
}

export const flashShowCapability: Command = {
  id: 'flash.show',
  label: 'Misskey Play 詳細',
  icon: 'ti-script',
  category: 'note',
  shortcuts: [],
  aiTool: true,
  permissions: ['account.read'],
  signature: {
    description:
      '指定 flashId の Misskey Play 詳細を返す。**AiScript ソース (`script`) も含む**' +
      ' ので、AI が既存 Play を読んで参考にできる。read-only。',
    params: {
      flashId: { type: 'string', description: '対象 flashId' },
      accountId: {
        type: 'string',
        description: ACCOUNT_ID_PARAM_DESC,
        optional: true,
      },
    },
    returns: {
      type: 'object',
      description: 'Flash 詳細 (title / summary / script / userId)',
    },
  },
  visible: false,
  execute: async (params) => {
    const flashId = pickString(params?.flashId)
    if (!flashId) throw new Error('flash.show: flashId is required')
    const accountId = pickString(params?.accountId)
    const api = await getApiAdapter(accountId)
    return await api.getFlash(flashId)
  },
}

export const FLASH_BUILTIN_CAPABILITIES: readonly Command[] = [
  flashListCapability,
  flashShowCapability,
]
