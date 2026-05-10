import type { Command } from '@/commands/registry'
import {
  deleteMemo,
  ensureMemosLoaded,
  generateMemoKey,
  loadMemo,
  type MemoData,
  saveMemo,
} from '@/composables/useMemos'
import { useAccountsStore } from '@/stores/accounts'

/**
 * Phase 5+: AI がローカルメモ (Zettelkasten 形式 markdown) を作成 / 編集する
 * write 系 capability。すべて `requiresConfirmation: true` を宣言し、
 * dispatcher が実行前に確認モーダルを出す。
 *
 * 設計:
 * - text のみ AI 制御。CW / visibility / fileIds / poll 等の post-draft フィールドは
 *   AI から触らせない (デフォルト値で作成、update では既存値を保持)
 * - `memos.create` は memoKey を自動採番 (Zettelkasten id = `YYYYMMDDHHmmss`)
 * - `memos.update` は id と新しい text を取り、他のフィールドは既存を保持
 *
 * 想定ユースケース:
 * - チャット中に「これメモっといて」と言われたら `memos.create`
 * - HEARTBEAT skill が継続観察すべき事項をメモとして残す
 * - ユーザーが書いた指示メモを AI が補足追記する (`memos.update`)
 */

function pickString(input: unknown): string | undefined {
  if (typeof input !== 'string') return undefined
  const t = input.trim()
  return t.length > 0 ? t : undefined
}

function pickStringArray(input: unknown): string[] | undefined {
  if (!Array.isArray(input)) return undefined
  const out: string[] = []
  for (const v of input) {
    if (typeof v !== 'string') continue
    const t = v.trim()
    if (t.length > 0) out.push(t)
  }
  return out
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

function emptyMemoData(text: string, tags: string[] = []): MemoData {
  return {
    text,
    cw: '',
    showCw: false,
    visibility: 'public',
    localOnly: false,
    fileIds: [],
    pollChoices: [],
    pollMultiple: false,
    showPoll: false,
    scheduledAt: null,
    tags,
  }
}

const ACCOUNT_ID_PARAM_DESC =
  'どのアカウントのメモ空間に保存するか。未指定なら active アカウント。' +
  ' 別アカウントに紐付けたいときだけ明示する。'

/** `memos.create` — 新規メモを作成する */
export const memosCreateCapability: Command = {
  id: 'memos.create',
  label: 'メモを作成',
  icon: 'ti-notes',
  category: 'general',
  shortcuts: [],
  aiTool: true,
  permissions: ['memos.write'],
  requiresConfirmation: true,
  signature: {
    description:
      'NoteDeck のローカル markdown メモを新規作成する。' +
      ' text + 任意の tags のみ指定可。CW / visibility / poll 等の投稿用フィールドは触らない' +
      ' (= デフォルト値で作成)。memoKey は Zettelkasten 形式 (`YYYYMMDDHHmmss`) で自動採番。' +
      ' 投稿前に確認モーダルが出る。',
    params: {
      text: {
        type: 'string',
        description: 'メモ本文 (空文字は不可、markdown 可)',
      },
      tags: {
        type: 'array',
        description:
          '任意の自由記述タグ (string[])。NoteDeck は値を enumerate しない。' +
          ' ユーザーが skill body 等で意味付けするので AI は文脈に応じて分類タグを付ける',
        optional: true,
      },
      accountId: {
        type: 'string',
        description: ACCOUNT_ID_PARAM_DESC,
        optional: true,
      },
    },
    returns: {
      type: 'object',
      description:
        '`{ id, text, updatedAt, accountId, tags? }` — id は Zettelkasten 形式の memoKey',
    },
  },
  visible: false,
  execute: async (params) => {
    const text = pickString(params?.text)
    if (!text) throw new Error('memos.create: text is required')
    const tags = pickStringArray(params?.tags) ?? []
    const accountId = resolveAccountId(params?.accountId)
    await ensureMemosLoaded()
    const memoKey = generateMemoKey()
    const stored = saveMemo(accountId, memoKey, emptyMemoData(text, tags))
    const result: Record<string, unknown> = {
      id: memoKey,
      text: stored.data.text,
      updatedAt: stored.updatedAt,
      accountId,
    }
    if (stored.data.tags.length > 0) result.tags = stored.data.tags
    return result
  },
}

/** `memos.update` — 既存メモの text / tags を更新する */
export const memosUpdateCapability: Command = {
  id: 'memos.update',
  label: 'メモを更新',
  icon: 'ti-edit',
  category: 'general',
  shortcuts: [],
  aiTool: true,
  permissions: ['memos.write'],
  requiresConfirmation: true,
  signature: {
    description:
      '既存ローカルメモの text / tags を更新する (どちらも optional、未指定なら維持)。' +
      ' CW / visibility 等の他のフィールドは既存値を保持。' +
      ' id は <memos> ブロックで参照できる Zettelkasten 形式 memoKey。' +
      ' 投稿前に確認モーダルが出る。',
    params: {
      id: {
        type: 'string',
        description: '更新対象の memoKey (Zettelkasten id, `YYYYMMDDHHmmss`)',
      },
      text: {
        type: 'string',
        description: '新しい本文 (未指定なら既存維持、空文字 "" 不可)',
        optional: true,
      },
      tags: {
        type: 'array',
        description:
          '新しい tags 配列 (未指定なら既存維持)。空配列 [] を渡すと tags を全削除',
        optional: true,
      },
      accountId: {
        type: 'string',
        description: ACCOUNT_ID_PARAM_DESC,
        optional: true,
      },
    },
    returns: {
      type: 'object',
      description: '`{ id, text, updatedAt, accountId, tags? }`',
    },
  },
  visible: false,
  execute: async (params) => {
    const id = pickString(params?.id)
    if (!id) throw new Error('memos.update: id is required')
    const text = pickString(params?.text)
    const tags = pickStringArray(params?.tags)
    if (text === undefined && tags === undefined) {
      throw new Error('memos.update: at least one of text / tags is required')
    }
    const accountId = resolveAccountId(params?.accountId)
    await ensureMemosLoaded()
    const existing = loadMemo(accountId, id)
    if (!existing) {
      throw new Error(`memos.update: memo "${id}" not found in account`)
    }
    const stored = saveMemo(accountId, id, {
      ...existing.data,
      text: text ?? existing.data.text,
      tags: tags ?? existing.data.tags,
    })
    const result: Record<string, unknown> = {
      id,
      text: stored.data.text,
      updatedAt: stored.updatedAt,
      accountId,
    }
    if (stored.data.tags.length > 0) result.tags = stored.data.tags
    return result
  },
}

/** `memos.delete` — 既存メモを削除する */
export const memosDeleteCapability: Command = {
  id: 'memos.delete',
  label: 'メモを削除',
  icon: 'ti-trash',
  category: 'general',
  shortcuts: [],
  aiTool: true,
  permissions: ['memos.write'],
  requiresConfirmation: true,
  signature: {
    description:
      '既存ローカルメモを削除する。削除前に確認モーダルが出る。' +
      ' 整理 skill の指示でユーザーが「古いメモを片付ける」フローで使う想定。' +
      ' 削除されたメモは復元できない (notedeck/memos/<id>.md ファイルが消える)。',
    params: {
      id: {
        type: 'string',
        description: '削除対象の memoKey (Zettelkasten id, `YYYYMMDDHHmmss`)',
      },
      accountId: {
        type: 'string',
        description: ACCOUNT_ID_PARAM_DESC,
        optional: true,
      },
    },
    returns: {
      type: 'object',
      description: '`{ ok: true, id, accountId }`',
    },
  },
  visible: false,
  execute: async (params) => {
    const id = pickString(params?.id)
    if (!id) throw new Error('memos.delete: id is required')
    const accountId = resolveAccountId(params?.accountId)
    await ensureMemosLoaded()
    const existing = loadMemo(accountId, id)
    if (!existing) {
      throw new Error(`memos.delete: memo "${id}" not found in account`)
    }
    deleteMemo(accountId, id)
    return { ok: true, id, accountId }
  },
}

export const MEMOS_BUILTIN_CAPABILITIES: readonly Command[] = [
  memosCreateCapability,
  memosUpdateCapability,
  memosDeleteCapability,
]
