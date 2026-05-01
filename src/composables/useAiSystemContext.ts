/**
 * AI に送る system prompt 末尾に注入する <notedeck-context> ブロックを組み立てる。
 *
 * - dataSources プリセット (ai.json5) で許可された項目のみを含める
 * - currentAccount / 任意のオブジェクトから credential 系フィールドを再帰的に除去
 * - 全項目 off の場合は空文字列を返す (空ブロックは出さない)
 *
 * Phase 1 では currentAccount / currentColumn / visibleNotes / recentConversation
 * の 4 種を扱う。visibleNotes / recentConversation は呼び出し側で取得して渡す。
 */

import type { Account } from '@/stores/accounts'
import type { DeckColumn } from '@/stores/deck'
import { type AiConfig, resolveDataSources } from './useAiConfig'

/**
 * AI に送ってはいけないフィールド名 (credential / 機密データ)。
 * Misskey の認証トークンキー `i` を含む。Phase 3 の credential proxy 実行モデルでも
 * これらは AI に渡らないようにする。
 */
const SENSITIVE_KEYS: ReadonlySet<string> = new Set([
  'token',
  'i',
  'accessToken',
  'refreshToken',
  'apiKey',
  'password',
  'secret',
])

/** 任意のオブジェクトから SENSITIVE_KEYS に一致するキーを再帰的に除去する。 */
export function stripCredentials<T>(input: T): T {
  if (Array.isArray(input)) {
    return input.map((v) => stripCredentials(v)) as unknown as T
  }
  if (input !== null && typeof input === 'object') {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
      if (SENSITIVE_KEYS.has(k)) continue
      out[k] = stripCredentials(v)
    }
    return out as T
  }
  return input
}

export interface AiContextInput {
  activeAccount: Account | null
  currentColumn: DeckColumn | null
  /** 既に projection 済みの可視ノート配列。空配列なら出力しない。 */
  visibleNotes?: unknown[]
  /** Phase 1 C5 で接続予定。未指定なら出力しない。 */
  recentConversation?: unknown[]
}

/** AI に渡す可視ノートの上限件数。 */
export const MAX_VISIBLE_NOTES = 10

/** AI 送信時に context に含める直近会話の上限ターン数 (= 直近 N メッセージ)。 */
export const MAX_RECENT_TURNS = 20

/**
 * AI 送信用に可視ノートを軽量化する projection。
 * - 上限 {@link MAX_VISIBLE_NOTES} 件まで
 * - text / cw 等の表示用フィールドのみ抽出 (循環参照と巨大 payload を回避)
 * - CW がある場合は本文を `[CW: <reason>]` に置換
 */
export interface ProjectedNote {
  id: string
  userId?: string
  username?: string
  text?: string
  createdAt?: string
}

export function projectVisibleNotes(
  notes: unknown[] | undefined,
  limit = MAX_VISIBLE_NOTES,
): ProjectedNote[] {
  if (!notes || notes.length === 0) return []
  return notes.slice(0, limit).map(projectOneNote)
}

/**
 * 直近の会話履歴を <recentConversation> 用に射影する。
 * 現セッションの history は API の messages としても渡るが、ここでは AI が
 * テキストとして「直近やり取り」を参照できるよう別形式でも提供する。
 * dataSource.recentConversation = false の場合は呼び出し側でこの関数を
 * 通さなければそもそも何も渡らない (= 過去会話を context に出さない)。
 */
export interface ProjectedTurn {
  role: 'user' | 'assistant' | 'system'
  content: string
}

export function projectRecentConversation(
  messages: { role: string; content: string }[] | undefined,
  limit = MAX_RECENT_TURNS,
): ProjectedTurn[] {
  if (!messages || messages.length === 0) return []
  const tail = messages.slice(-limit)
  const out: ProjectedTurn[] = []
  for (const m of tail) {
    if (m.role !== 'user' && m.role !== 'assistant' && m.role !== 'system') {
      continue
    }
    out.push({
      role: m.role,
      content: typeof m.content === 'string' ? m.content : '',
    })
  }
  return out
}

function projectOneNote(n: unknown): ProjectedNote {
  if (!n || typeof n !== 'object') return { id: 'unknown' }
  const o = n as Record<string, unknown>
  const id = typeof o.id === 'string' ? o.id : 'unknown'
  const userId = typeof o.userId === 'string' ? o.userId : undefined
  const createdAt = typeof o.createdAt === 'string' ? o.createdAt : undefined
  const cw = typeof o.cw === 'string' && o.cw.length > 0 ? o.cw : null
  const username =
    o.user && typeof o.user === 'object'
      ? typeof (o.user as Record<string, unknown>).username === 'string'
        ? ((o.user as Record<string, unknown>).username as string)
        : undefined
      : undefined
  const text =
    cw != null ? `[CW: ${cw}]` : typeof o.text === 'string' ? o.text : undefined
  return { id, userId, username, text, createdAt }
}

function jsonBlock(obj: unknown): string {
  return JSON.stringify(stripCredentials(obj), null, 2)
}

/**
 * dataSources 設定と context 入力から `<notedeck-context>` XML ブロックを組む。
 * 何も入らない場合は空文字列を返す (skills prompt との結合で no-op になる)。
 */
export function buildAiContextBlock(
  config: AiConfig,
  ctx: AiContextInput,
): string {
  const ds = resolveDataSources(config.dataSources)
  const parts: string[] = []

  if (ds.currentAccount && ctx.activeAccount) {
    parts.push(
      `  <currentAccount>\n${jsonBlock(ctx.activeAccount)}\n  </currentAccount>`,
    )
  }
  if (ds.currentColumn && ctx.currentColumn) {
    parts.push(
      `  <currentColumn>\n${jsonBlock(ctx.currentColumn)}\n  </currentColumn>`,
    )
  }
  if (ds.visibleNotes && ctx.visibleNotes && ctx.visibleNotes.length > 0) {
    parts.push(
      `  <visibleNotes>\n${jsonBlock(ctx.visibleNotes)}\n  </visibleNotes>`,
    )
  }
  if (
    ds.recentConversation &&
    ctx.recentConversation &&
    ctx.recentConversation.length > 0
  ) {
    parts.push(
      `  <recentConversation>\n${jsonBlock(ctx.recentConversation)}\n  </recentConversation>`,
    )
  }

  if (parts.length === 0) return ''
  return `<notedeck-context>\n${parts.join('\n')}\n</notedeck-context>`
}

/**
 * skills 由来の system prompt と <notedeck-context> ブロックを連結する。
 * どちらも空なら undefined を返す (= system prompt なしで API を呼ぶ既存挙動)。
 */
export function joinSystemPrompt(
  skillsPrompt: string,
  contextBlock: string,
): string | undefined {
  if (skillsPrompt && contextBlock) {
    return `${skillsPrompt}\n\n${contextBlock}`
  }
  return skillsPrompt || contextBlock || undefined
}
