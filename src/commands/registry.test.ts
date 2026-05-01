import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  _clearCapabilitiesForTest,
  getCapability,
} from '@/capabilities/registry'
import { type Command, useCommandStore } from './registry'

function makeUiCommand(overrides: Partial<Command> = {}): Command {
  return {
    id: 'ui.only',
    label: 'UI only',
    icon: 'ti-pencil',
    category: 'general',
    shortcuts: [],
    execute: () => undefined,
    ...overrides,
  }
}

function makeAiCapableCommand(overrides: Partial<Command> = {}): Command {
  return makeUiCommand({
    id: 'cap.do',
    aiTool: true,
    signature: { description: 'something AI can do' },
    ...overrides,
  })
}

describe('useCommandStore mirror to capability registry', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })
  afterEach(() => {
    _clearCapabilitiesForTest()
  })

  it('register a UI-only command does NOT mirror to capability registry', () => {
    const store = useCommandStore()
    store.register(makeUiCommand({ id: 'ui-1' }))
    expect(getCapability('ui-1')).toBeUndefined()
  })

  it('register an AI-capable command mirrors to capability registry', () => {
    const store = useCommandStore()
    const cmd = makeAiCapableCommand({ id: 'cap-1' })
    store.register(cmd)
    expect(getCapability('cap-1')).toBe(cmd)
  })

  it('register requires both aiTool: true AND a signature for mirroring', () => {
    const store = useCommandStore()
    // aiTool: true だけでは signature 不在で mirror されない
    store.register(makeUiCommand({ id: 'half-1', aiTool: true }))
    expect(getCapability('half-1')).toBeUndefined()
    // signature だけで aiTool が false / 未指定なら mirror されない
    store.register(
      makeUiCommand({
        id: 'half-2',
        signature: { description: 'd' },
      }),
    )
    expect(getCapability('half-2')).toBeUndefined()
  })

  it('unregister removes from capability registry too', () => {
    const store = useCommandStore()
    store.register(makeAiCapableCommand({ id: 'cap-2' }))
    expect(getCapability('cap-2')).toBeDefined()
    store.unregister('cap-2')
    expect(getCapability('cap-2')).toBeUndefined()
  })

  it('unregister of UI-only command does not touch capability registry', () => {
    const store = useCommandStore()
    // capability 側に直接登録された別 command が消されないこと
    store.register(makeAiCapableCommand({ id: 'standalone' }))
    store.register(makeUiCommand({ id: 'ui-2' }))
    store.unregister('ui-2')
    expect(getCapability('standalone')).toBeDefined()
  })

  it('re-registering the same id with new aiTool flag updates both registries', () => {
    const store = useCommandStore()
    // First: UI only
    store.register(makeUiCommand({ id: 'morphing', label: 'first' }))
    expect(getCapability('morphing')).toBeUndefined()
    // Then: same id with aiTool + signature → should appear in capability registry
    const upgraded = makeAiCapableCommand({ id: 'morphing', label: 'second' })
    store.register(upgraded)
    expect(getCapability('morphing')).toBe(upgraded)
  })
})
