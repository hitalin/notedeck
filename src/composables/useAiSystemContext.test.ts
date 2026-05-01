import { describe, expect, it } from 'vitest'
import type { Account } from '@/stores/accounts'
import type { DeckColumn } from '@/stores/deck'
import {
  type AiConfig,
  defaultConfig,
  setDataSourcePreset,
} from './useAiConfig'
import {
  buildAiContextBlock,
  joinSystemPrompt,
  MAX_RECENT_TURNS,
  MAX_VISIBLE_NOTES,
  projectRecentConversation,
  projectVisibleNotes,
  stripCredentials,
} from './useAiSystemContext'

const SAMPLE_ACCOUNT: Account = {
  id: 'acc-1',
  host: 'misskey.example',
  userId: 'u1',
  username: 'taka',
  displayName: 'Taka',
  avatarUrl: null,
  software: 'misskey-dev/misskey',
  hasToken: true,
}

function configWithDataSources(preset: 'readonly' | 'safe' | 'full'): AiConfig {
  const cfg = defaultConfig()
  cfg.dataSources = setDataSourcePreset(cfg.dataSources, preset)
  return cfg
}

describe('stripCredentials', () => {
  it('removes top-level credential fields', () => {
    const input = {
      id: 'a',
      token: 'secret',
      i: 'misskey-token',
      apiKey: 'sk-...',
      accessToken: 'a',
      refreshToken: 'r',
      password: 'p',
      secret: 's',
    }
    expect(stripCredentials(input)).toEqual({ id: 'a' })
  })

  it('removes nested credentials in deep objects', () => {
    const input = {
      user: { name: 'foo', token: 'leak', nested: { i: 'leak2', ok: 1 } },
    }
    expect(stripCredentials(input)).toEqual({
      user: { name: 'foo', nested: { ok: 1 } },
    })
  })

  it('handles arrays of objects', () => {
    const input = [
      { name: 'a', password: 'p1' },
      { name: 'b', token: 't' },
    ]
    expect(stripCredentials(input)).toEqual([{ name: 'a' }, { name: 'b' }])
  })

  it('returns primitives untouched (string / number / null / undefined / boolean)', () => {
    expect(stripCredentials('hello')).toBe('hello')
    expect(stripCredentials(42)).toBe(42)
    expect(stripCredentials(null)).toBe(null)
    expect(stripCredentials(undefined)).toBe(undefined)
    expect(stripCredentials(true)).toBe(true)
  })
})

describe('buildAiContextBlock', () => {
  it('returns empty string when nothing to inject (no account, no column)', () => {
    const cfg = configWithDataSources('full')
    expect(
      buildAiContextBlock(cfg, { activeAccount: null, currentColumn: null }),
    ).toBe('')
  })

  it('outputs currentAccount block by default (readonly preset)', () => {
    const cfg = defaultConfig() // readonly: currentAccount on, visibleNotes off
    const block = buildAiContextBlock(cfg, {
      activeAccount: SAMPLE_ACCOUNT,
      currentColumn: null,
    })
    expect(block).toContain('<currentAccount>')
    expect(block).toContain('"username": "taka"')
    expect(block).not.toContain('<visibleNotes>')
    expect(block).not.toContain('<recentConversation>')
  })

  it('strips Misskey-style credential fields from a leaky account-like object', () => {
    const cfg = defaultConfig()
    const leaky = {
      ...SAMPLE_ACCOUNT,
      // 想定外の漏洩シナリオ: account に直接トークンを混入
      token: 'SHOULD-NOT-LEAK-1',
      i: 'SHOULD-NOT-LEAK-2',
      accessToken: 'SHOULD-NOT-LEAK-3',
    } as unknown as Account
    const block = buildAiContextBlock(cfg, {
      activeAccount: leaky,
      currentColumn: null,
    })
    expect(block).toContain('"id": "acc-1"')
    expect(block).not.toContain('SHOULD-NOT-LEAK-1')
    expect(block).not.toContain('SHOULD-NOT-LEAK-2')
    expect(block).not.toContain('SHOULD-NOT-LEAK-3')
  })

  it('returns empty string when ALL dataSources are off via custom preset', () => {
    const cfg = defaultConfig()
    cfg.dataSources = {
      preset: 'custom',
      custom: {
        currentAccount: false,
        currentColumn: false,
        visibleNotes: false,
        recentConversation: false,
      },
    }
    const block = buildAiContextBlock(cfg, {
      activeAccount: SAMPLE_ACCOUNT,
      currentColumn: { id: 'c', type: 'timeline' } as unknown as DeckColumn,
      visibleNotes: [{ id: 'n1', text: 'hi' }],
      recentConversation: [{ role: 'user', content: 'msg' }],
    })
    expect(block).toBe('')
    // notedeck-context タグ自体が出ない
    expect(block).not.toContain('<notedeck-context')
  })

  it('does not leak credentials anywhere (worst-case account / column / notes / conversation)', () => {
    const cfg = configWithDataSources('full')
    const leakyAccount = {
      ...SAMPLE_ACCOUNT,
      i: 'LEAK-i',
      token: 'LEAK-token',
      accessToken: 'LEAK-at',
      refreshToken: 'LEAK-rt',
      apiKey: 'LEAK-ak',
      password: 'LEAK-pw',
      secret: 'LEAK-sec',
    } as unknown as Account
    const leakyColumn = {
      id: 'col-1',
      type: 'timeline',
      accountId: null,
      name: 'TL',
      token: 'LEAK-col-tok',
      filters: { secret: 'LEAK-filter-sec' },
    } as unknown as DeckColumn
    const leakyNotes = [
      { id: 'n1', text: 'hello', token: 'LEAK-note-tok' },
      { id: 'n2', text: 'world', user: { username: 'foo', i: 'LEAK-user-i' } },
    ]
    const leakyConv = [
      { role: 'user', content: 'msg1' },
      { role: 'assistant', content: 'reply1' },
    ]

    const block = buildAiContextBlock(cfg, {
      activeAccount: leakyAccount,
      currentColumn: leakyColumn,
      visibleNotes: leakyNotes, // 注: stripCredentials は raw でも効く
      recentConversation: leakyConv,
    })

    const leaks = [
      'LEAK-i',
      'LEAK-token',
      'LEAK-at',
      'LEAK-rt',
      'LEAK-ak',
      'LEAK-pw',
      'LEAK-sec',
      'LEAK-col-tok',
      'LEAK-filter-sec',
      'LEAK-note-tok',
      'LEAK-user-i',
    ]
    for (const leak of leaks) {
      expect(block, `must not leak ${leak}`).not.toContain(leak)
    }
    // 正常データはちゃんと出ている
    expect(block).toContain('"username": "taka"')
    expect(block).toContain('"id": "col-1"')
    expect(block).toContain('"text": "hello"')
  })

  it('respects dataSources off — skips currentAccount when disabled', () => {
    const cfg = defaultConfig()
    cfg.dataSources = {
      preset: 'custom',
      custom: {
        ...cfg.dataSources.custom,
        currentAccount: false,
        currentColumn: false,
      },
    }
    const block = buildAiContextBlock(cfg, {
      activeAccount: SAMPLE_ACCOUNT,
      currentColumn: null,
    })
    expect(block).toBe('')
  })

  it('omits visibleNotes block when array is empty even if enabled', () => {
    const cfg = configWithDataSources('safe')
    const block = buildAiContextBlock(cfg, {
      activeAccount: SAMPLE_ACCOUNT,
      currentColumn: null,
      visibleNotes: [],
    })
    expect(block).not.toContain('<visibleNotes>')
  })

  it('includes visibleNotes block when enabled and non-empty', () => {
    const cfg = configWithDataSources('safe')
    const block = buildAiContextBlock(cfg, {
      activeAccount: null,
      currentColumn: null,
      visibleNotes: [{ id: 'n1', text: 'hello' }],
    })
    expect(block).toContain('<visibleNotes>')
    expect(block).toContain('"id": "n1"')
  })

  it('emits column meta when currentColumn dataSource is on', () => {
    const cfg = defaultConfig()
    const column = {
      id: 'col-1',
      type: 'timeline',
      name: 'TL',
      accountId: null,
    } as unknown as DeckColumn
    const block = buildAiContextBlock(cfg, {
      activeAccount: null,
      currentColumn: column,
    })
    expect(block).toContain('<currentColumn>')
    expect(block).toContain('"id": "col-1"')
  })
})

describe('projectVisibleNotes', () => {
  it('returns empty array when input is empty / undefined', () => {
    expect(projectVisibleNotes(undefined)).toEqual([])
    expect(projectVisibleNotes([])).toEqual([])
  })

  it('caps the result at MAX_VISIBLE_NOTES (10) by default', () => {
    const many = Array.from({ length: 25 }, (_, i) => ({
      id: `n${i}`,
      text: `t${i}`,
    }))
    const out = projectVisibleNotes(many)
    expect(out).toHaveLength(MAX_VISIBLE_NOTES)
    expect(out[0]?.id).toBe('n0')
    expect(out[9]?.id).toBe('n9')
  })

  it('extracts id / userId / text / createdAt and inner user.username', () => {
    const out = projectVisibleNotes([
      {
        id: 'n1',
        userId: 'u1',
        text: 'hi',
        createdAt: '2026-05-01T00:00:00Z',
        user: { username: 'taka' },
      },
    ])
    expect(out[0]).toEqual({
      id: 'n1',
      userId: 'u1',
      username: 'taka',
      text: 'hi',
      createdAt: '2026-05-01T00:00:00Z',
    })
  })

  it('replaces text with [CW: <reason>] when cw is set', () => {
    const out = projectVisibleNotes([
      { id: 'n1', cw: 'spoiler', text: 'big secret' },
    ])
    expect(out[0]?.text).toBe('[CW: spoiler]')
    expect(out[0]?.text).not.toContain('big secret')
  })

  it('handles primitives / nullish entries gracefully', () => {
    const out = projectVisibleNotes([null, 'string', { id: 'ok' }])
    expect(out).toHaveLength(3)
    expect(out[0]?.id).toBe('unknown')
    expect(out[1]?.id).toBe('unknown')
    expect(out[2]?.id).toBe('ok')
  })
})

describe('projectRecentConversation', () => {
  it('returns empty array for empty / undefined input', () => {
    expect(projectRecentConversation(undefined)).toEqual([])
    expect(projectRecentConversation([])).toEqual([])
  })

  it('keeps the last MAX_RECENT_TURNS messages by default (= 20)', () => {
    const many = Array.from({ length: 50 }, (_, i) => ({
      role: 'user' as const,
      content: `m${i}`,
    }))
    const out = projectRecentConversation(many)
    expect(out).toHaveLength(MAX_RECENT_TURNS)
    expect(out[0]?.content).toBe('m30')
    expect(out[19]?.content).toBe('m49')
  })

  it('drops messages whose role is not user / assistant / system', () => {
    const out = projectRecentConversation([
      { role: 'user', content: 'hi' },
      { role: 'tool' as unknown as 'user', content: 'ignored' },
      { role: 'assistant', content: 'hello' },
    ])
    expect(out).toEqual([
      { role: 'user', content: 'hi' },
      { role: 'assistant', content: 'hello' },
    ])
  })

  it('coerces non-string content to empty string', () => {
    const out = projectRecentConversation([
      {
        role: 'user',
        content: { foo: 1 } as unknown as string,
      },
    ])
    expect(out).toEqual([{ role: 'user', content: '' }])
  })
})

describe('joinSystemPrompt', () => {
  it('returns undefined when both inputs are empty', () => {
    expect(joinSystemPrompt('', '')).toBeUndefined()
  })

  it('returns skills prompt alone when context is empty', () => {
    expect(joinSystemPrompt('You are helpful.', '')).toBe('You are helpful.')
  })

  it('returns context block alone when skills prompt is empty', () => {
    expect(joinSystemPrompt('', '<notedeck-context></notedeck-context>')).toBe(
      '<notedeck-context></notedeck-context>',
    )
  })

  it('joins both with double newline separator', () => {
    expect(joinSystemPrompt('You are helpful.', '<notedeck-context/>')).toBe(
      'You are helpful.\n\n<notedeck-context/>',
    )
  })
})
