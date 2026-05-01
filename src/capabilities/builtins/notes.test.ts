import { describe, expect, it } from 'vitest'
import {
  NOTES_BUILTIN_CAPABILITIES,
  notesSearchCapability,
  notesTimelineCapability,
  notesUserCapability,
} from './notes'

// Note: 実 adapter / Misskey API 呼び出しは ユニットテストでは
// 検証しない (Tauri / fetch の depends あり)。本テストは capability
// 定義の正しさ + 入力検証 (params validation) のみ。
// 実挙動は dom テストか実機 / E2E で確認。

describe('notes.search capability', () => {
  it('declares notes.read permission and aiTool: true', () => {
    expect(notesSearchCapability.permissions).toEqual(['notes.read'])
    expect(notesSearchCapability.aiTool).toBe(true)
    expect(notesSearchCapability.id).toBe('notes.search')
    expect(notesSearchCapability.signature?.returns?.type).toBe('array')
  })

  it('marks query as required and limit as optional', () => {
    const params = notesSearchCapability.signature?.params
    expect(params?.query?.optional).not.toBe(true)
    expect(params?.limit?.optional).toBe(true)
  })

  it('throws when query is missing or blank', async () => {
    await expect(notesSearchCapability.execute({})).rejects.toThrow(
      /query is required/,
    )
    await expect(
      notesSearchCapability.execute({ query: '   ' }),
    ).rejects.toThrow(/query is required/)
  })
})

describe('notes.timeline capability', () => {
  it('declares notes.read permission and aiTool: true', () => {
    expect(notesTimelineCapability.permissions).toEqual(['notes.read'])
    expect(notesTimelineCapability.aiTool).toBe(true)
    expect(notesTimelineCapability.id).toBe('notes.timeline')
  })

  it('declares the timeline type enum', () => {
    const enums = notesTimelineCapability.signature?.params?.type?.enum
    expect(enums).toEqual(['home', 'local', 'social', 'global'])
  })

  it('rejects invalid timeline types', async () => {
    await expect(
      notesTimelineCapability.execute({ type: 'mentions' }),
    ).rejects.toThrow(/invalid type/)
    await expect(notesTimelineCapability.execute({ type: '' })).rejects.toThrow(
      /invalid type/,
    )
  })
})

describe('notes.user capability', () => {
  it('declares notes.read permission and aiTool: true', () => {
    expect(notesUserCapability.permissions).toEqual(['notes.read'])
    expect(notesUserCapability.aiTool).toBe(true)
    expect(notesUserCapability.id).toBe('notes.user')
  })

  it('marks userId as required', () => {
    const params = notesUserCapability.signature?.params
    expect(params?.userId?.optional).not.toBe(true)
  })

  it('throws when userId is missing or blank', async () => {
    await expect(notesUserCapability.execute({})).rejects.toThrow(
      /userId is required/,
    )
    await expect(
      notesUserCapability.execute({ userId: '   ' }),
    ).rejects.toThrow(/userId is required/)
  })
})

describe('NOTES_BUILTIN_CAPABILITIES', () => {
  it('contains all three notes capabilities', () => {
    expect(NOTES_BUILTIN_CAPABILITIES).toHaveLength(3)
    expect(NOTES_BUILTIN_CAPABILITIES).toContain(notesSearchCapability)
    expect(NOTES_BUILTIN_CAPABILITIES).toContain(notesTimelineCapability)
    expect(NOTES_BUILTIN_CAPABILITIES).toContain(notesUserCapability)
  })
})
