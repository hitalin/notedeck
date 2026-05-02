import { describe, expect, it } from 'vitest'
import {
  _internal,
  applyHeartbeatSuppression,
  HEARTBEAT_OK_TOKEN,
} from './useHeartbeatDaemon'

// Note: useHeartbeatDaemon 自体は Pinia store / Tauri event listen / SkillStore
// を必要とするため統合的にユニットテストしない。本テストは OpenClaw 流の
// suppression 純関数 / 定数 / instruction 文言の shape のみ検証する。

describe('applyHeartbeatSuppression (OpenClaw 流)', () => {
  it('returns null for the exact token', () => {
    expect(applyHeartbeatSuppression('HEARTBEAT_OK')).toBeNull()
  })

  it('returns null when surrounded by whitespace', () => {
    expect(applyHeartbeatSuppression('  HEARTBEAT_OK  ')).toBeNull()
    expect(applyHeartbeatSuppression('\n\nHEARTBEAT_OK\n')).toBeNull()
  })

  it('returns null for empty / whitespace-only / null / undefined', () => {
    expect(applyHeartbeatSuppression('')).toBeNull()
    expect(applyHeartbeatSuppression('   \n')).toBeNull()
    expect(applyHeartbeatSuppression(null)).toBeNull()
    expect(applyHeartbeatSuppression(undefined)).toBeNull()
  })

  it('strips leading HEARTBEAT_OK then drops if remainder is short ack', () => {
    // 先頭 HEARTBEAT_OK + 短い ack → 全体 drop
    expect(applyHeartbeatSuppression('HEARTBEAT_OK\nnothing urgent')).toBeNull()
  })

  it('strips trailing HEARTBEAT_OK then drops if remainder is short ack', () => {
    expect(applyHeartbeatSuppression('all clear\nHEARTBEAT_OK')).toBeNull()
  })

  it('preserves long alert text even when wrapped with HEARTBEAT_OK', () => {
    // 長いアラート (300 文字超) は drop しない
    const longAlert = 'これは大事なメンションです。'.repeat(30)
    expect(longAlert.length).toBeGreaterThan(300)
    const wrapped = `HEARTBEAT_OK\n\n${longAlert}\n\nHEARTBEAT_OK`
    const result = applyHeartbeatSuppression(wrapped)
    expect(result).not.toBeNull()
    expect(result).toContain(longAlert.trim())
    // 先頭 / 末尾の token は剥がされている
    expect(result?.startsWith(HEARTBEAT_OK_TOKEN)).toBe(false)
    expect(result?.endsWith(HEARTBEAT_OK_TOKEN)).toBe(false)
  })

  it('does NOT touch HEARTBEAT_OK in the middle (= alert containing the literal)', () => {
    const middle =
      '注意: AI が HEARTBEAT_OK を返さなかった理由を確認してください。'
    expect(applyHeartbeatSuppression(middle)).toBe(middle)
  })

  it('returns the trimmed body when alert > ackMaxChars threshold', () => {
    const alert = 'X'.repeat(400)
    expect(applyHeartbeatSuppression(alert)).toBe(alert)
  })

  it('respects custom ackMaxChars threshold', () => {
    // threshold 1000 で長いアラートも ack 扱いになるケース
    const medium = 'short alert text'
    expect(applyHeartbeatSuppression(medium, 1000)).toBeNull()
    // threshold 5 なら drop されない
    expect(applyHeartbeatSuppression(medium, 5)).toBe(medium)
  })

  it('keeps non-ack alerts at the threshold boundary', () => {
    // ちょうど ackMaxChars = 300 のテキスト → ack 扱い (drop)
    const exactly300 = 'a'.repeat(300)
    expect(applyHeartbeatSuppression(exactly300)).toBeNull()
    // 301 文字 → 表示
    const just301 = 'a'.repeat(301)
    expect(applyHeartbeatSuppression(just301)).toBe(just301)
  })
})

describe('HEARTBEAT_OK_TOKEN', () => {
  it('matches the constant used in instruction prompt', () => {
    expect(HEARTBEAT_OK_TOKEN).toBe('HEARTBEAT_OK')
    expect(_internal.HEARTBEAT_INSTRUCTION).toContain(HEARTBEAT_OK_TOKEN)
  })
})

describe('HEARTBEAT_INSTRUCTION', () => {
  it('mentions HEARTBEAT skill (= OpenClaw style "follow strictly")', () => {
    expect(_internal.HEARTBEAT_INSTRUCTION).toContain('HEARTBEAT')
    expect(_internal.HEARTBEAT_INSTRUCTION).toContain('過去の会話')
  })
})
