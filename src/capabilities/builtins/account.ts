import type { Command } from '@/commands/registry'
import { stripCredentials } from '@/composables/useAiSystemContext'
import { useAccountsStore } from '@/stores/accounts'

/**
 * `account.current` — 現在 active なアカウント情報を返す read 系 capability。
 *
 * `permissions: ['account.read']` を要求するので、ai.json5 が `readonly`
 * 以上のプリセットなら通る。stripCredentials を念のため通して credential
 * 系フィールドを除去する (Account 型自体には現状 token は含まれないが、
 * 将来の漏洩シナリオ対策)。
 */
export const accountCurrentCapability: Command = {
  id: 'account.current',
  label: '現在のアカウント情報',
  icon: 'ti-user',
  category: 'account',
  shortcuts: [],
  aiTool: true,
  permissions: ['account.read'],
  signature: {
    description:
      'ユーザーが今フォーカスしている (active) アカウントの情報を返す。' +
      ' Misskey サーバーの host や displayName, username 等が含まれる。' +
      ' 認証トークンは含まれない。',
    params: {},
    returns: {
      type: 'object',
      description:
        '`{ id, host, userId, username, displayName, avatarUrl, software, hasToken }`' +
        ' (アクティブなアカウントが無いときは null)',
    },
  },
  visible: false,
  execute: () => {
    const account = useAccountsStore().activeAccount
    return account ? stripCredentials(account) : null
  },
}

/**
 * `account.list` — ログイン中の全アカウントを返す。
 */
export const accountListCapability: Command = {
  id: 'account.list',
  label: 'アカウント一覧',
  icon: 'ti-users',
  category: 'account',
  shortcuts: [],
  aiTool: true,
  permissions: ['account.read'],
  signature: {
    description:
      'NoteDeck にログイン中の全アカウントを配列で返す。複数サーバーを' +
      ' 横断したい場合に使う。認証トークンは含まれない。',
    params: {},
    returns: {
      type: 'array',
      description: 'Account の配列',
    },
  },
  visible: false,
  execute: () => {
    return stripCredentials(useAccountsStore().accounts)
  },
}

export const ACCOUNT_BUILTIN_CAPABILITIES: readonly Command[] = [
  accountCurrentCapability,
  accountListCapability,
]
