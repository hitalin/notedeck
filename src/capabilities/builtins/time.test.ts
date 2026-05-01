import { describe, expect, it } from 'vitest'
import { BUILTIN_CAPABILITIES, timeNowCapability } from './time'

describe('time.now capability', () => {
  it('has aiTool: true and zero permissions', () => {
    expect(timeNowCapability.aiTool).toBe(true)
    expect(timeNowCapability.permissions).toEqual([])
  })

  it('declares a string return signature', () => {
    expect(timeNowCapability.signature?.returns?.type).toBe('string')
  })

  it('execute returns an ISO 8601 string close to now', () => {
    const before = Date.now()
    const result = timeNowCapability.execute()
    const after = Date.now()
    expect(typeof result).toBe('string')
    const parsed = Date.parse(result as string)
    expect(parsed).toBeGreaterThanOrEqual(before)
    expect(parsed).toBeLessThanOrEqual(after)
    // ISO 8601 (UTC, 'Z' suffix) を確認
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/)
  })

  it('BUILTIN_CAPABILITIES includes time.now', () => {
    expect(BUILTIN_CAPABILITIES).toContain(timeNowCapability)
  })
})
