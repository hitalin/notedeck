/**
 * Capability Registry の型定義 (Phase 2 入口)。
 *
 * Capability = 「NoteDeck で実行できる操作」の単位。
 * 既存の `Command` interface に optional フィールドを追加することで、
 * UI / CLI / HTTP API / AiScript / AI Tool calling の 5 つの呼び出し口で
 * 共通利用できる Single Source of Truth へ進化させる。
 *
 * Phase 2 A-1 (本ファイル): 型定義のみ。実 dispatcher は A-2 で実装。
 *
 * 設計詳細: #408 "Capability Registry as Single Source of Truth"
 *   https://github.com/hitalin/notedeck/issues/408#issuecomment-4334932896
 */

import type { PermissionKey } from '@/composables/useAiConfig'

/**
 * Capability の引数 1 つを表す型情報。
 * - JSON Schema に近いシンプル形式
 * - AI tool schema (Anthropic / OpenAI) や OpenAPI spec への自動変換の元データ
 */
export interface ParameterDef {
  type: 'string' | 'number' | 'boolean' | 'object' | 'array'
  description: string
  /** 省略可能なら true。未指定 = false (= 必須) */
  optional?: boolean
  /** 文字列 enum 風の許容値リスト */
  enum?: readonly string[]
}

/**
 * Capability の戻り値の型情報。
 * 戻り値が無い (副作用のみ) capability は `'void'` を指定する。
 */
export interface ReturnTypeDef {
  type: 'string' | 'number' | 'boolean' | 'object' | 'array' | 'void'
  description?: string
}

/**
 * Capability の型シグネチャ。
 * params / returns がある capability は AI tool schema や OpenAPI を自動生成できる。
 *
 * Phase 1 では値の保存のみ。Phase 2 で実 dispatcher が読み込む。
 */
export interface CapabilitySignature {
  /** ユーザー / AI に見せる説明 (Anthropic `tool description` 相当) */
  description: string
  /** 名前付き引数 (順序ではなく key ベース) */
  params?: Record<string, ParameterDef>
  /** 戻り値の型 */
  returns?: ReturnTypeDef
}

// 呼び出し元側で permissions 宣言型を参照するときの再 export
export type { PermissionKey }
