import JSON5 from 'json5'
import { describe, expect, it, vi } from 'vitest'

import {
  type AiSession,
  CURRENT_SCHEMA_VERSION,
  deserialize,
  serialize,
} from '@/services/aiSessionCodec'

function makeSession(partial: Partial<AiSession> = {}): AiSession {
  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    id: '20260722120000',
    kind: 'chat',
    title: 'test',
    model: 'claude-fable-5',
    connectionId: 'conn-1',
    createdAt: 1,
    updatedAt: 2,
    messageCount: 0,
    messages: [],
    lastMessagePreview: '',
    ...partial,
  }
}

describe('serialize', () => {
  it('空値の optional フィールドはファイルに書かない', () => {
    const raw = serialize(makeSession())
    const parsed = JSON5.parse(raw)
    expect(parsed).not.toHaveProperty('personaSkillId')
    expect(parsed).not.toHaveProperty('triggeredSkillIds')
    expect(parsed).not.toHaveProperty('unknownFields')
  })

  it('unknownFields はトップレベルに展開して書き戻す (forward-compat)', () => {
    const raw = serialize(
      makeSession({ unknownFields: { futureField: { nested: true } } }),
    )
    const parsed = JSON5.parse(raw)
    expect(parsed.futureField).toEqual({ nested: true })
    expect(parsed).not.toHaveProperty('unknownFields')
  })
})

describe('deserialize', () => {
  it('serialize との round-trip で未知フィールドを保持する', () => {
    const original = JSON.stringify({
      schemaVersion: 1,
      id: 's1',
      kind: 'chat',
      title: 't',
      model: 'm',
      connectionId: 'c',
      createdAt: 1,
      updatedAt: 2,
      messages: [],
      futureField: 'keep-me',
    })
    const session = deserialize(original)
    expect(session?.unknownFields).toEqual({ futureField: 'keep-me' })

    const rewritten = JSON5.parse(serialize(session as AiSession))
    expect(rewritten.futureField).toBe('keep-me')
  })

  it('空 content の assistant placeholder を落とす (tool_use 付きは残す)', () => {
    const session = deserialize(
      JSON.stringify({
        schemaVersion: 1,
        id: 's1',
        kind: 'chat',
        title: 't',
        model: 'm',
        connectionId: 'c',
        createdAt: 1,
        updatedAt: 2,
        messages: [
          { id: 'u1', role: 'user', content: 'q', timestamp: 1 },
          { id: 'a1', role: 'assistant', content: '', timestamp: 2 },
          {
            id: 'a2',
            role: 'assistant',
            content: '',
            timestamp: 3,
            toolUseId: 'toolu_1',
          },
        ],
      }),
    )
    expect(session?.messages.map((m) => m.id)).toEqual(['u1', 'a2'])
    expect(session?.messageCount).toBe(2)
  })

  it('パース不能な内容は warn して null を返す', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    expect(deserialize('{{{ broken')).toBeNull()
    expect(deserialize('"just a string"')).toBeNull()
    expect(warn).toHaveBeenCalled()
    warn.mockRestore()
  })

  it('型が壊れたフィールドはデフォルトへフォールバックする', () => {
    const session = deserialize(
      JSON.stringify({
        id: 's1',
        kind: 'chat',
        title: 42,
        model: null,
        messages: 'not-an-array',
        triggeredSkillIds: ['ok', 42, '', null],
      }),
    )
    expect(session?.schemaVersion).toBe(1)
    expect(session?.title).toBe('')
    expect(session?.model).toBe('')
    expect(session?.messages).toEqual([])
    expect(session?.triggeredSkillIds).toEqual(['ok'])
  })
})
