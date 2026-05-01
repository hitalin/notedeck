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
  /** Phase 1 C4 で接続予定。未指定なら出力しない。 */
  visibleNotes?: unknown[]
  /** Phase 1 C5 で接続予定。未指定なら出力しない。 */
  recentConversation?: unknown[]
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
