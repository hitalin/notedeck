import { beforeEach, describe, expect, it, vi } from 'vitest'
import { effectScope } from 'vue'
import {
  AiChatCancelledError,
  toolResultWireMessage,
  toolUseWireMessage,
  useAiChat,
} from './useAiChat'

// --- Tauri mock (cancel settle テスト用 #770) ---

const listeners: Array<(p: unknown) => void> = []
vi.mock('@/utils/tauriEvents', () => ({
  listenTauri: vi.fn(async (_event: string, cb: (p: unknown) => void) => {
    listeners.push(cb)
    return () => {
      const i = listeners.indexOf(cb)
      if (i >= 0) listeners.splice(i, 1)
    }
  }),
}))

const aiChatSend = vi.fn(async () => ({ status: 'ok', data: null }))
const aiChatCancel = vi.fn(async () => ({ status: 'ok', data: null }))
vi.mock('@/utils/tauriInvoke', async () => {
  const actual = await vi.importActual<typeof import('@/utils/tauriInvoke')>(
    '@/utils/tauriInvoke',
  )
  return {
    unwrap: actual.unwrap,
    commands: {
      aiChatSend: (...args: unknown[]) => aiChatSend(...(args as [])),
      aiChatCancel: (...args: unknown[]) => aiChatCancel(...(args as [])),
    },
  }
})

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

describe('useAiChat.cancel (#770: 中断を正規の終端イベントにする)', () => {
  beforeEach(() => {
    listeners.length = 0
    aiChatSend.mockClear()
    aiChatCancel.mockClear()
  })

  function setup() {
    const scope = effectScope()
    const chat = scope.run(() => useAiChat())
    if (!chat) throw new Error('scope.run failed')
    return { scope, chat }
  }

  it('進行中の sendMessage を AiChatCancelledError で settle する', async () => {
    const { scope, chat } = setup()
    const promise = chat.sendMessage({
      connectionId: 'c1',
      model: 'm1',
      history: [],
    })
    // listener 登録 (= ストリーム確立) を待つ
    await vi.waitFor(() => expect(listeners.length).toBe(1))
    expect(chat.isStreaming.value).toBe(true)

    await chat.cancel()

    await expect(promise).rejects.toBeInstanceOf(AiChatCancelledError)
    expect(chat.isStreaming.value).toBe(false)
    // Rust 側の task abort も要求している
    expect(aiChatCancel).toHaveBeenCalledTimes(1)
    scope.stop()
  })

  it('scope dispose (unmount) でも進行中の sendMessage を settle する', async () => {
    const { scope, chat } = setup()
    const promise = chat.sendMessage({
      connectionId: 'c1',
      model: 'm1',
      history: [],
    })
    await vi.waitFor(() => expect(listeners.length).toBe(1))

    scope.stop()

    await expect(promise).rejects.toBeInstanceOf(AiChatCancelledError)
    expect(aiChatCancel).toHaveBeenCalledTimes(1)
  })

  it('ストリームが無いときの cancel は no-op (Rust cancel を呼ばない)', async () => {
    const { scope, chat } = setup()
    await chat.cancel()
    expect(aiChatCancel).not.toHaveBeenCalled()
    scope.stop()
  })
})
