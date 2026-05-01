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
