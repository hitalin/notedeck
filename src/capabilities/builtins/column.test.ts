import { describe, expect, it } from 'vitest'
import {
  COLUMN_BUILTIN_CAPABILITIES,
  columnAddCapability,
  columnListCapability,
} from './column'

// Note: 実 deckStore が profileStore に深く依存するため、execute() の挙動を
// 真に検証するには Tauri / Pinia の本体を起動する必要がある。本ユニット
// テストは capability 定義 (signature / permissions / enum) の正しさだけを
// 検証する。execute の挙動は実機 / E2E で確認する。

describe('column.list capability', () => {
  it('declares no permissions and aiTool: true', () => {
    expect(columnListCapability.permissions).toEqual([])
    expect(columnListCapability.aiTool).toBe(true)
    expect(columnListCapability.signature?.returns?.type).toBe('array')
  })

  it('uses dot-notation id', () => {
    expect(columnListCapability.id).toBe('column.list')
  })

  it('advertises accountHost in signature description and returns', () => {
    // <currentColumn> 補強と対をなす多サーバー対応:
    // AI が account.list を呼ばずに「どれが misskey.io カラムか」判定できる
    expect(columnListCapability.signature?.description).toContain('accountHost')
    expect(columnListCapability.signature?.returns?.description).toContain(
      'accountHost',
    )
  })
})

describe('column.add capability', () => {
  it('declares no permissions and aiTool: true', () => {
    expect(columnAddCapability.permissions).toEqual([])
    expect(columnAddCapability.aiTool).toBe(true)
  })

  it('throws on unsupported types (channel / list / antenna require config)', () => {
    expect(() => columnAddCapability.execute({ type: 'channel' })).toThrow(
      /Unsupported/,
    )
    expect(() => columnAddCapability.execute({ type: 'unknown' })).toThrow(
      /Unsupported/,
    )
  })

  it('declares its enum on the type parameter', () => {
    const enums = columnAddCapability.signature?.params?.type?.enum
    expect(enums).toBeDefined()
    expect(enums).toContain('timeline')
    expect(enums).toContain('notifications')
    expect(enums).not.toContain('channel') // requires extra config
    expect(enums).not.toContain('list') // requires listId
    expect(enums).not.toContain('antenna') // requires antennaId
  })

  it('marks type as required and name as optional', () => {
    const params = columnAddCapability.signature?.params
    expect(params?.type?.optional).not.toBe(true)
    expect(params?.name?.optional).toBe(true)
  })
})

describe('COLUMN_BUILTIN_CAPABILITIES', () => {
  it('contains list and add', () => {
    expect(COLUMN_BUILTIN_CAPABILITIES).toContain(columnListCapability)
    expect(COLUMN_BUILTIN_CAPABILITIES).toContain(columnAddCapability)
  })
})
