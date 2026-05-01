import { afterEach, describe, expect, it } from 'vitest'
import type { Command } from '@/commands/registry'
import {
  type AiConfig,
  defaultConfig,
  setPermissionPreset,
} from '@/composables/useAiConfig'
import { dispatchCapability } from './dispatcher'
import { _clearCapabilitiesForTest, registerCapability } from './registry'

function makeCapability(overrides: Partial<Command> = {}): Command {
  return {
    id: 'test.cap',
    label: 'test',
    icon: 'ti-flask',
    category: 'general',
    shortcuts: [],
    aiTool: true,
    permissions: [],
    signature: { description: 'test capability' },
    execute: () => 'ok',
    ...overrides,
  }
}

function configWithPreset(preset: 'readonly' | 'safe' | 'full'): AiConfig {
  const cfg = defaultConfig()
  cfg.permissions = setPermissionPreset(cfg.permissions, preset)
  return cfg
}

afterEach(() => {
  _clearCapabilitiesForTest()
})

describe('dispatchCapability', () => {
  it('returns ok + result for a registered no-permission capability', async () => {
    registerCapability(makeCapability({ id: 'a', execute: () => 'hello' }))
    const r = await dispatchCapability(
      'a',
      undefined,
      configWithPreset('readonly'),
    )
    expect(r).toEqual({ ok: true, result: 'hello' })
  })

  it('returns unknown_capability for an unregistered id', async () => {
    const r = await dispatchCapability('not-here', {}, configWithPreset('full'))
    expect(r.ok).toBe(false)
    if (!r.ok) {
      expect(r.code).toBe('unknown_capability')
      expect(r.error).toContain('not-here')
    }
  })

  it('returns permission_denied when required permissions are not allowed', async () => {
    registerCapability(
      makeCapability({ id: 'notes.post', permissions: ['notes.write'] }),
    )
    const r = await dispatchCapability(
      'notes.post',
      { text: 'hi' },
      configWithPreset('readonly'), // notes.write は false
    )
    expect(r.ok).toBe(false)
    if (!r.ok) {
      expect(r.code).toBe('permission_denied')
      expect(r.error).toContain('notes.write')
    }
  })

  it('passes when all required permissions are allowed', async () => {
    registerCapability(
      makeCapability({
        id: 'notes.react',
        permissions: ['notes.react'],
        execute: () => 'reacted',
      }),
    )
    const r = await dispatchCapability(
      'notes.react',
      undefined,
      configWithPreset('safe'), // notes.react は true
    )
    expect(r).toEqual({ ok: true, result: 'reacted' })
  })

  it('returns execute_failed when the capability throws', async () => {
    registerCapability(
      makeCapability({
        id: 'broken',
        execute: () => {
          throw new Error('boom')
        },
      }),
    )
    const r = await dispatchCapability(
      'broken',
      undefined,
      configWithPreset('full'),
    )
    expect(r.ok).toBe(false)
    if (!r.ok) {
      expect(r.code).toBe('execute_failed')
      expect(r.error).toContain('boom')
    }
  })

  it('forwards params to execute and supports async execute', async () => {
    let received: unknown = null
    registerCapability(
      makeCapability({
        id: 'echo',
        execute: async (params) => {
          received = params
          return params
        },
      }),
    )
    const r = await dispatchCapability(
      'echo',
      { greeting: 'hello' },
      configWithPreset('full'),
    )
    expect(r).toEqual({ ok: true, result: { greeting: 'hello' } })
    expect(received).toEqual({ greeting: 'hello' })
  })

  it('reports ALL missing permissions when more than one is denied', async () => {
    registerCapability(
      makeCapability({
        id: 'multi',
        permissions: ['notes.write', 'network.external'],
      }),
    )
    const r = await dispatchCapability(
      'multi',
      undefined,
      configWithPreset('readonly'),
    )
    expect(r.ok).toBe(false)
    if (!r.ok) {
      expect(r.error).toContain('notes.write')
      expect(r.error).toContain('network.external')
    }
  })
})
