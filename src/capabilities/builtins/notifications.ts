import { initAdapterFor } from '@/adapters/factory'
import type { ApiAdapter } from '@/adapters/types'
import type { Command } from '@/commands/registry'
import { projectVisibleItems } from '@/composables/useAiSystemContext'
import { useAccountsStore } from '@/stores/accounts'

/**
 * AI が 1 回の呼び出しで取得できる通知の上限 (Misskey API native 上限と一致)。
 * untilId で続きを引けるので「もっと取って」と AI に頼めばページング可能。
 */
const MAX_NOTIFICATIONS_PER_CALL = 100
const DEFAULT_LIMIT = 10

async function getApiAdapter(): Promise<ApiAdapter> {
  const store = useAccountsStore()
  const id = store.activeAccountId
  if (!id) throw new Error('No active account')
  const acc = store.accounts.find((a) => a.id === id)
  if (!acc) throw new Error(`Account "${id}" not found`)
  const { adapter } = await initAdapterFor(acc.host, acc.id)
  return adapter.api
}

function clampLimit(input: unknown, fallback = DEFAULT_LIMIT): number {
  if (typeof input !== 'number' || !Number.isFinite(input)) return fallback
  return Math.max(1, Math.min(MAX_NOTIFICATIONS_PER_CALL, Math.floor(input)))
}

function pickUntilId(input: unknown): string | undefined {
  if (typeof input !== 'string') return undefined
  const trimmed = input.trim()
  return trimmed.length > 0 ? trimmed : undefined
}

/**
 * `notifications.list` — 通知一覧を取得する read 系 capability。
 * 通知本文 (リアクション元 / リプライ元のノート) は projectVisibleItems の
 * 'notifications' kind で軽量化された projection が返る。
 */
export const notificationsListCapability: Command = {
  id: 'notifications.list',
  label: '通知一覧',
  icon: 'ti-bell',
  category: 'general',
  shortcuts: [],
  aiTool: true,
  permissions: ['notifications'],
  signature: {
    description:
      '現在 active なアカウントの通知一覧を取得する。type / userId / noteId /' +
      ' reaction / createdAt 等の projection が返る。' +
      ' 100 件を超えて取得したい場合は、最後の通知の id を untilId に渡して再呼び出し。',
    params: {
      limit: {
        type: 'number',
        description: '取得件数 (1-100, default 10)',
        optional: true,
      },
      untilId: {
        type: 'string',
        description:
          'この ID より前の通知を取得 (ページング用)。前回呼び出しの最後の通知の id を渡す。',
        optional: true,
      },
    },
    returns: {
      type: 'array',
      description: '通知 projection の配列',
    },
  },
  visible: false,
  execute: async (params) => {
    const limit = clampLimit(params?.limit)
    const untilId = pickUntilId(params?.untilId)
    const api = await getApiAdapter()
    const notifications = await api.getNotifications({ limit, untilId })
    return projectVisibleItems(notifications, 'notifications', limit)
  },
}

export const NOTIFICATIONS_BUILTIN_CAPABILITIES: readonly Command[] = [
  notificationsListCapability,
]
