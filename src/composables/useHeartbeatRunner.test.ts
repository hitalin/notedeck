import { describe, expect, it } from 'vitest'
import {
  _internal,
  HEARTBEAT_OK_TOKEN,
  isHeartbeatOk,
} from './useHeartbeatRunner'

// Note: useHeartbeatRunner 自体は Pinia store / Tauri event listen を必要と
// するため統合的にユニットテストしない。本テストは抑制判定 / 定数 / preset
// プロンプトの shape のみ検証する (実挙動は dom テスト or E2E)。

describe('isHeartbeatOk', () => {
  it('returns true for the exact token', () => {
    expect(isHeartbeatOk('HEARTBEAT_OK')).toBe(true)
  })

  it('returns true when surrounded by whitespace / newlines', () => {
    expect(isHeartbeatOk('  HEARTBEAT_OK  ')).toBe(true)
    expect(isHeartbeatOk('\n\nHEARTBEAT_OK\n')).toBe(true)
  })

  it('returns true for empty / whitespace-only / null / undefined', () => {
    expect(isHeartbeatOk('')).toBe(true)
    expect(isHeartbeatOk('   \n')).toBe(true)
    expect(isHeartbeatOk(null)).toBe(true)
    expect(isHeartbeatOk(undefined)).toBe(true)
  })

  it('returns false when AI added extra text (= report exists)', () => {
    expect(isHeartbeatOk('HEARTBEAT_OK\n\n念のため詳細:')).toBe(false)
    expect(isHeartbeatOk('未読メンション 3 件')).toBe(false)
  })

  it('is case-sensitive (false negative bias = show, not hide)', () => {
    // AI が小文字で返したら「報告」として扱う (隠すより表示の方が安全)
    expect(isHeartbeatOk('heartbeat_ok')).toBe(false)
    expect(isHeartbeatOk('Heartbeat_Ok')).toBe(false)
  })
})

describe('HEARTBEAT_OK_TOKEN', () => {
  it('matches the constant used in instruction prompt', () => {
    expect(HEARTBEAT_OK_TOKEN).toBe('HEARTBEAT_OK')
    expect(_internal.HEARTBEAT_INSTRUCTION).toContain(HEARTBEAT_OK_TOKEN)
  })
})

describe('PRESET_PROMPTS', () => {
  it('has unreadMentions preset (HB-A1 only one implemented)', () => {
    expect(_internal.PRESET_PROMPTS.unreadMentions).toBeDefined()
    expect(_internal.PRESET_PROMPTS.unreadMentions).toContain(
      'notifications.list',
    )
  })
})
