import { initAdapterFor } from '@/adapters/factory'
import type { ApiAdapter } from '@/adapters/types'
import type { Command } from '@/commands/registry'
import { stripCredentials } from '@/composables/useAiSystemContext'
import { useAccountsStore } from '@/stores/accounts'

/**
 * `user.lookup` — username (+ optional host) から Misskey ユーザー情報を引く。
 *
 * AI が `@hitalin@yami.ski` 形式の文字列を受け取ったとき、`notes.user` に渡せる
 * 内部 user ID を取り出す動線。`notes.user` は内部 ID 必須なのでこの 1 段挟む。
 *
 * Misskey の `users/show` を使う。host は `@hitalin@yami.ski` の `yami.ski` 部分
 * (ローカル / 自インスタンスのときは省略可)。
 */
async function getApiAdapter(): Promise<ApiAdapter> {
  const store = useAccountsStore()
  const id = store.activeAccountId
  if (!id) throw new Error('No active account')
  const acc = store.accounts.find((a) => a.id === id)
  if (!acc) throw new Error(`Account "${id}" not found`)
  const { adapter } = await initAdapterFor(acc.host, acc.id)
  return adapter.api
}

export const userLookupCapability: Command = {
  id: 'user.lookup',
  label: 'ユーザー検索',
  icon: 'ti-user-search',
  category: 'account',
  shortcuts: [],
  aiTool: true,
  permissions: ['account.read'],
  signature: {
    description:
      'username (+ 任意で host) から Misskey ユーザー情報を取得する。' +
      ' `@user@example.com` 形式から userId を引いて notes.user に渡す動線で使う。' +
      ' 戻り値の id が Misskey 内部の user ID。',
    params: {
      username: {
        type: 'string',
        description: 'username (先頭の `@` は不要)',
      },
      host: {
        type: 'string',
        description:
          'リモートホスト (例: `yami.ski`)。同インスタンス内ユーザーなら省略。',
        optional: true,
      },
    },
    returns: {
      type: 'object',
      description:
        'NormalizedUser (id / username / host / name / avatarUrl 等)',
    },
  },
  visible: false,
  execute: async (params) => {
    const rawUsername =
      typeof params?.username === 'string' ? params.username.trim() : ''
    if (!rawUsername) throw new Error('user.lookup: username is required')
    // 入力の先頭 `@` を除去 (`@hitalin` → `hitalin`)
    const username = rawUsername.startsWith('@')
      ? rawUsername.slice(1)
      : rawUsername
    const host =
      typeof params?.host === 'string' && params.host.trim().length > 0
        ? params.host.trim()
        : null
    const api = await getApiAdapter()
    const user = await api.lookupUser(username, host)
    return stripCredentials(user)
  },
}

export const USER_BUILTIN_CAPABILITIES: readonly Command[] = [
  userLookupCapability,
]
