import { describe, expect, it } from 'vitest'
import { toolResultWireMessage, toolUseWireMessage } from './useAiChat'

describe('toolUseWireMessage', () => {
  it('builds an assistant wire message with tool_use_* fields', () => {
    const msg = toolUseWireMessage({
      toolUseId: 'toolu_1',
      name: 'time.now',
      input: {},
    })
    expect(msg.role).toBe('assistant')
    expect(msg.content).toBe('')
    expect(msg.tool_use_id).toBe('toolu_1')
    expect(msg.tool_use_name).toBe('time.now')
    expect(msg.tool_use_input).toEqual({})
    expect(msg.tool_result_for).toBeUndefined()
  })

  it('forwards assistantText into the content field', () => {
    const msg = toolUseWireMessage({
      toolUseId: 'toolu_1',
      name: 'time.now',
      input: { tz: 'Asia/Tokyo' },
      assistantText: 'Let me check the time.',
    })
    expect(msg.content).toBe('Let me check the time.')
    expect(msg.tool_use_input).toEqual({ tz: 'Asia/Tokyo' })
  })
})

describe('toolResultWireMessage', () => {
  it('builds a user wire message with tool_result_for', () => {
    const msg = toolResultWireMessage({
      toolUseId: 'toolu_1',
      result: '2026-05-01T00:00:00Z',
    })
    expect(msg.role).toBe('user')
    expect(msg.content).toBe('2026-05-01T00:00:00Z')
    expect(msg.tool_result_for).toBe('toolu_1')
    expect(msg.tool_use_id).toBeUndefined()
  })
})
