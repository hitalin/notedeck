/**
 * AI セッション (`sessions/<id>.json5`) の serialize / deserialize (#782 Phase 2)。
 *
 * forward-compat (未知フィールドの保持・書き戻し) と読込時浄化 (#770 の
 * streaming placeholder 除去) という壊れやすい正規化を store から分離し、
 * フレームワーク非依存の純関数として直接テストする。
 */

import JSON5 from 'json5'
import type { ChatMessage } from '@/composables/useAiChat'

export const CURRENT_SCHEMA_VERSION = 1

export type AiSessionKind = 'chat' | 'command' | 'task' | 'heartbeat'

/** セッション一覧 (ドロワー) で使う軽量メタ。 */
export interface AiSessionMeta {
  id: string
  kind: AiSessionKind
  title: string
  model: string
  /** 使用する Vault 接続の id (#564)。旧 session は空文字。 */
  connectionId: string
  createdAt: number
  updatedAt: number
  messageCount: number
  /** 最後のメッセージ本文プレビュー (drawer 表示用、120 文字 trim)。空可。 */
  lastMessagePreview: string
  /**
   * このセッションが作成された時点の persona skill id (#491、snapshot)。
   * `aiConfig.personaSkillId` (= 新規セッションのデフォルト) と独立に session
   * 自身が値を保持するため、後でグローバル設定を変えても過去セッションの
   * persona 表示は固定されたまま (Git commit の Author header と同じ
   * immutable semantic)。空文字 / 未指定 = persona なしで作成された session。
   */
  personaSkillId?: string
}

/** メタ + 本文。chat 以外の kind が増えたら discriminated union 化する。 */
export interface AiSession extends AiSessionMeta {
  schemaVersion: number
  messages: ChatMessage[]
  /**
   * このセッションで一度でも発火した mode='trigger' skill の id 累積 (#725)。
   * トリガー語を含まないフォローアップターンでも skill 本文を system prompt に
   * 保ち続ける session-sticky 状態。セッション新規作成で自然に空になる。
   * dangling id (後で削除された skill) は composedSystemPrompt 側が無視する
   * ので掃除不要。
   */
  triggeredSkillIds?: string[]
  /** 知らないフィールドは forward-compat で保持して書き戻す。 */
  unknownFields?: Record<string, unknown>
}

interface PersistShape {
  schemaVersion: number
  id: string
  kind: AiSessionKind
  title: string
  model: string
  connectionId: string
  createdAt: number
  updatedAt: number
  messages: ChatMessage[]
  [key: string]: unknown
}

const KNOWN_FIELDS = new Set([
  'schemaVersion',
  'id',
  'kind',
  'title',
  'model',
  'connectionId',
  'createdAt',
  'updatedAt',
  'messages',
  'personaSkillId',
  'triggeredSkillIds',
])

export function serialize(session: AiSession): string {
  const out: Record<string, unknown> = {
    schemaVersion: session.schemaVersion,
    id: session.id,
    kind: session.kind,
    title: session.title,
    model: session.model,
    connectionId: session.connectionId,
    createdAt: session.createdAt,
    updatedAt: session.updatedAt,
    messages: session.messages,
  }
  if (session.personaSkillId) out.personaSkillId = session.personaSkillId
  if (session.triggeredSkillIds?.length) {
    out.triggeredSkillIds = session.triggeredSkillIds
  }
  if (session.unknownFields) {
    for (const [k, v] of Object.entries(session.unknownFields)) {
      out[k] = v
    }
  }
  return `${JSON.stringify(out, null, 2)}\n`
}

export function deserialize(raw: string): AiSession | null {
  let parsed: unknown
  try {
    parsed = JSON5.parse(raw)
  } catch (e) {
    console.warn('[ai-sessions] parse failed:', e)
    return null
  }
  if (!parsed || typeof parsed !== 'object') {
    console.warn('[ai-sessions] parse failed: not an object')
    return null
  }
  const r = parsed as PersistShape
  // 空 content の assistant はストリーミング placeholder の残骸 (#770 中断や
  // 異常終了で永続化されたもの)。tool_use 付き (本文空で tool 呼び出しのみ) は
  // 正当なターンなので残す。
  const messages = (Array.isArray(r.messages) ? r.messages : []).filter(
    (m) => !(m?.role === 'assistant' && !m.content && !m.toolUseId),
  )
  const triggeredSkillIds = Array.isArray(r.triggeredSkillIds)
    ? r.triggeredSkillIds.filter(
        (x): x is string => typeof x === 'string' && x.length > 0,
      )
    : []
  const unknownFields: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(r)) {
    if (!KNOWN_FIELDS.has(k)) unknownFields[k] = v
  }
  return {
    schemaVersion: typeof r.schemaVersion === 'number' ? r.schemaVersion : 1,
    id: typeof r.id === 'string' ? r.id : '',
    kind: (r.kind as AiSessionKind) || 'chat',
    title: typeof r.title === 'string' ? r.title : '',
    model: typeof r.model === 'string' ? r.model : '',
    connectionId: typeof r.connectionId === 'string' ? r.connectionId : '',
    createdAt: typeof r.createdAt === 'number' ? r.createdAt : Date.now(),
    updatedAt: typeof r.updatedAt === 'number' ? r.updatedAt : Date.now(),
    messages,
    messageCount: messages.length,
    // drawer 表示用 preview は listSorted() 側で computed する。AiSession 自体には
    // 永続化せず、空文字を入れて型を満たす。
    lastMessagePreview: '',
    personaSkillId:
      typeof r.personaSkillId === 'string' && r.personaSkillId
        ? r.personaSkillId
        : undefined,
    triggeredSkillIds:
      triggeredSkillIds.length > 0 ? triggeredSkillIds : undefined,
    unknownFields:
      Object.keys(unknownFields).length > 0 ? unknownFields : undefined,
  }
}
