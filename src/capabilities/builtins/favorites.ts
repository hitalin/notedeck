import { initAdapterFor } from '@/adapters/factory'
import type { ApiAdapter } from '@/adapters/types'
import type { Command } from '@/commands/registry'
import { useAccountsStore } from '@/stores/accounts'

/**
 * Favorites — Misskey の「お気に入り」(自分だけが見える private bookmark)。
 * 他人に通知は飛ばず、自分しか見えないので軽い。`notes.react` permission を
 * 再利用 (= リアクションと同レベル、ただし react の方が公開度が高い)。
 *
 * 確認 UI は標準 (danger だが内容は軽い、可逆)。
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

function pickString(v: unknown): string | undefined {
  if (typeof v !== 'string') return undefined
  const t = v.trim()
  return t.length > 0 ? t : undefined
}

const ACCOUNT_ID_PARAM_DESC =
  'どのアカウントで実行するか。未指定なら active アカウント。' +
  ' 別サーバーのカラムから操作するときは `<currentColumn>.accountId` を渡す。'

export const favoritesAddCapability: Command = {
  id: 'favorites.add',
  label: 'お気に入りに追加',
  icon: 'ti-star',
  category: 'note',
  shortcuts: [],
  aiTool: true,
  permissions: ['notes.react'],
  requiresConfirmation: true,
  signature: {
    description:
      '指定ノートを自分のお気に入りに追加する。他人には通知されず、自分しか' +
      '見えない private bookmark。リアクションとは別軸 (リアクションは公開)。',
    params: {
      noteId: { type: 'string', description: '対象 noteId' },
      accountId: {
        type: 'string',
        description: ACCOUNT_ID_PARAM_DESC,
        optional: true,
      },
    },
    returns: { type: 'object', description: '{ favorited: true, noteId }' },
  },
  visible: false,
  execute: async (params) => {
    const noteId = pickString(params?.noteId)
    if (!noteId) throw new Error('favorites.add: noteId is required')
    const accountId = pickString(params?.accountId)
    const api = await getApiAdapter(accountId)
    await api.createFavorite(noteId)
    return { favorited: true, noteId }
  },
}

export const favoritesRemoveCapability: Command = {
  id: 'favorites.remove',
  label: 'お気に入りから削除',
  icon: 'ti-star-off',
  category: 'note',
  shortcuts: [],
  aiTool: true,
  permissions: ['notes.react'],
  requiresConfirmation: true,
  signature: {
    description: '指定ノートをお気に入りから削除する。',
    params: {
      noteId: { type: 'string', description: '対象 noteId' },
      accountId: {
        type: 'string',
        description: ACCOUNT_ID_PARAM_DESC,
        optional: true,
      },
    },
    returns: { type: 'object', description: '{ unfavorited: true, noteId }' },
  },
  visible: false,
  execute: async (params) => {
    const noteId = pickString(params?.noteId)
    if (!noteId) throw new Error('favorites.remove: noteId is required')
    const accountId = pickString(params?.accountId)
    const api = await getApiAdapter(accountId)
    await api.deleteFavorite(noteId)
    return { unfavorited: true, noteId }
  },
}

export const FAVORITES_BUILTIN_CAPABILITIES: readonly Command[] = [
  favoritesAddCapability,
  favoritesRemoveCapability,
]
