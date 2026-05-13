import type { Command } from '@/commands/registry'
import { useAccountsStore } from '@/stores/accounts'
import { commands, unwrap } from '@/utils/tauriInvoke'

/**
 * Announcements (Misskey サーバーアナウンス) 系 capability。
 *
 * サーバー管理者がサーバー全体に流すお知らせ。read-only で AI に開放する。
 * adapter には未登録だが Tauri commands.apiGetAnnouncements (specta) で
 * 直接呼べる (account_id, limit, is_active の 3 引数)。
 *
 * permission: `account.read`。サーバー側情報、認証不要でも引けるが
 * NoteDeck の Rust commands は account_id 経由なのでログイン前提。
 *
 * announcements.read (既読化) は `account.write` 相当の副作用があり
 * AI が勝手に既読にして読み逃しを引き起こすリスクがあるので本 PR では
 * 提供しない (= read-only のみ)。
 */

function pickNumber(v: unknown): number | undefined {
  if (typeof v !== 'number' || !Number.isFinite(v)) return undefined
  return v
}

function pickBoolean(v: unknown): boolean | undefined {
  return typeof v === 'boolean' ? v : undefined
}

function resolveAccountId(input: unknown): string {
  const explicit = typeof input === 'string' ? input.trim() : ''
  if (explicit) return explicit
  const store = useAccountsStore()
  const id = store.activeAccountId
  if (!id) throw new Error('announcements: no active account')
  return id
}

export const announcementsListCapability: Command = {
  id: 'announcements.list',
  label: 'サーバーアナウンス一覧',
  icon: 'ti-megaphone',
  category: 'account',
  shortcuts: [],
  aiTool: true,
  permissions: ['account.read'],
  signature: {
    description:
      'Misskey サーバーのアナウンス一覧を返す (read-only)。is_active=true (default)' +
      ' で現在有効なアナウンスのみ、false で過去含む。既読化は副作用ありのため' +
      ' 本 capability では提供しない (取得のみ)。',
    params: {
      limit: {
        type: 'number',
        description: '取得件数 (default 30, 1-100)',
        optional: true,
      },
      isActive: {
        type: 'boolean',
        description: '現在有効なアナウンスのみ (default: true)',
        optional: true,
      },
      accountId: {
        type: 'string',
        description:
          'どのアカウントで取得するか。未指定なら active アカウント。',
        optional: true,
      },
    },
    returns: { type: 'array', description: 'Announcement の配列' },
    cheap: true,
  },
  visible: false,
  execute: async (params) => {
    const accountId = resolveAccountId(params?.accountId)
    const limit = pickNumber(params?.limit) ?? null
    const isActive = pickBoolean(params?.isActive) ?? null
    return unwrap(
      await commands.apiGetAnnouncements(accountId, limit, isActive),
    )
  },
}

export const ANNOUNCEMENTS_BUILTIN_CAPABILITIES: readonly Command[] = [
  announcementsListCapability,
]
