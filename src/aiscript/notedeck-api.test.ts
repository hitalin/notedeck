import { utils, values } from '@syuilo/aiscript'
import type { Value } from '@syuilo/aiscript/interpreter/value.js'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Command, useCommandStore } from '@/commands/registry'
import {
  cleanupNoteDeckEnv,
  createNoteDeckEnv,
  type NoteDeckEnvContext,
} from './notedeck-api'

// Note: 本テストは「Nd:register_command が options を Command にどう乗せるか」だけを
// 検証する。AiScript インタプリタ経由の execute 挙動は実機 / E2E で確認する。

function makeFakeStores(): {
  ctx: NoteDeckEnvContext
  register: ReturnType<typeof vi.fn>
  unregister: ReturnType<typeof vi.fn>
} {
  const register = vi.fn()
  const unregister = vi.fn()
  const commandStore = {
    register,
    unregister,
  } as unknown as ReturnType<typeof useCommandStore>
  return {
    ctx: { commandStore, registeredCommandIds: [] },
    register,
    unregister,
  }
}

const noop = () => {
  // AiScript の AbortHandler 系コールバック用ダミー
}

/** `Nd:register_command` を呼ぶための AiScript native call ヘルパ */
async function callRegisterCommand(
  env: Record<string, Value>,
  args: (Value | undefined)[],
): Promise<void> {
  const fn = env['Nd:register_command']
  if (!fn || fn.type !== 'fn' || !fn.native) {
    throw new Error('Nd:register_command is not a native fn')
  }
  await fn.native(args, {
    // テストでは AiScript ハンドラを実行しないので opts は最低限のスタブで十分
    call: () => Promise.resolve(values.NULL),
    topCall: () => Promise.resolve(values.NULL),
    registerAbortHandler: noop,
    registerPauseHandler: noop,
    registerUnpauseHandler: noop,
    unregisterAbortHandler: noop,
    unregisterPauseHandler: noop,
    unregisterUnpauseHandler: noop,
  } as Parameters<NonNullable<typeof fn.native>>[1])
}

/** register モックの n 回目に渡された Command を取り出す */
function nthCommand(
  register: ReturnType<typeof vi.fn>,
  index: number,
): Command {
  const call = register.mock.calls[index]
  if (!call) throw new Error(`register was not called ${index + 1} times`)
  return call[0] as Command
}

const dummyHandler = values.FN_NATIVE(() => values.NULL)

describe('Nd:register_command (4-arg legacy form)', () => {
  let env: Record<string, Value>
  let register: ReturnType<typeof vi.fn>

  beforeEach(() => {
    const stores = makeFakeStores()
    env = createNoteDeckEnv(stores.ctx)
    register = stores.register
  })

  it('registers a UI-only command without capability fields', async () => {
    await callRegisterCommand(env, [
      values.STR('greet'),
      values.STR('Greet'),
      values.STR('ti-hand'),
      dummyHandler,
    ])
    expect(register).toHaveBeenCalledTimes(1)
    const cmd = nthCommand(register, 0)
    expect(cmd.id).toBe('nd-plugin:greet')
    expect(cmd.label).toBe('Greet')
    expect(cmd.icon).toBe('ti-hand')
    expect(cmd.category).toBe('general')
    expect(cmd.aiTool).toBeUndefined()
    expect(cmd.signature).toBeUndefined()
    expect(cmd.permissions).toBeUndefined()
    expect(cmd.requiresConfirmation).toBeUndefined()
  })
})

describe('Nd:register_command (5-arg with options)', () => {
  let env: Record<string, Value>
  let register: ReturnType<typeof vi.fn>

  beforeEach(() => {
    const stores = makeFakeStores()
    env = createNoteDeckEnv(stores.ctx)
    register = stores.register
  })

  it('forwards aiTool/signature/permissions/requiresConfirmation to commandStore', async () => {
    const options = utils.jsToVal({
      aiTool: true,
      permissions: ['notes.write.post'],
      requiresConfirmation: true,
      signature: {
        description: 'Reverse the input string',
        params: {
          text: {
            type: 'string',
            description: 'Input text',
          },
        },
        returns: { type: 'string', description: 'Reversed text' },
        cheap: true,
      },
    })
    await callRegisterCommand(env, [
      values.STR('reverse'),
      values.STR('Reverse'),
      values.STR('ti-arrow-back'),
      dummyHandler,
      options,
    ])
    expect(register).toHaveBeenCalledTimes(1)
    const cmd = nthCommand(register, 0)
    expect(cmd.aiTool).toBe(true)
    expect(cmd.permissions).toEqual(['notes.write.post'])
    expect(cmd.requiresConfirmation).toBe(true)
    expect(cmd.signature?.description).toBe('Reverse the input string')
    expect(cmd.signature?.params?.text?.type).toBe('string')
    expect(cmd.signature?.returns?.type).toBe('string')
    expect(cmd.signature?.cheap).toBe(true)
  })

  it('keeps aiTool false when omitted, even if signature is present', async () => {
    const options = utils.jsToVal({
      signature: { description: 'no ai exposure' },
    })
    await callRegisterCommand(env, [
      values.STR('local-only'),
      values.STR('Local'),
      values.STR('ti-home'),
      dummyHandler,
      options,
    ])
    const cmd = nthCommand(register, 0)
    expect(cmd.aiTool).toBeUndefined()
    expect(cmd.signature?.description).toBe('no ai exposure')
  })

  it('drops non-string entries from permissions array', async () => {
    const options = utils.jsToVal({
      aiTool: true,
      permissions: ['notes.read', 123, null, 'notifications.read'],
      signature: { description: 'mixed perms' },
    })
    await callRegisterCommand(env, [
      values.STR('mixed'),
      values.STR('Mixed'),
      values.STR('ti-filter'),
      dummyHandler,
      options,
    ])
    const cmd = nthCommand(register, 0)
    expect(cmd.permissions).toEqual(['notes.read', 'notifications.read'])
  })

  it('ignores a non-object options argument', async () => {
    await callRegisterCommand(env, [
      values.STR('plain'),
      values.STR('Plain'),
      values.STR('ti-dot'),
      dummyHandler,
      values.STR('not-an-object'),
    ])
    const cmd = nthCommand(register, 0)
    expect(cmd.aiTool).toBeUndefined()
    expect(cmd.signature).toBeUndefined()
  })
})

describe('cleanupNoteDeckEnv', () => {
  it('unregisters every command registered through Nd:register_command', async () => {
    const stores = makeFakeStores()
    const env = createNoteDeckEnv(stores.ctx)
    await callRegisterCommand(env, [
      values.STR('a'),
      values.STR('A'),
      values.STR('ti-a'),
      dummyHandler,
    ])
    await callRegisterCommand(env, [
      values.STR('b'),
      values.STR('B'),
      values.STR('ti-b'),
      dummyHandler,
    ])
    expect(stores.ctx.registeredCommandIds).toEqual([
      'nd-plugin:a',
      'nd-plugin:b',
    ])
    cleanupNoteDeckEnv(stores.ctx)
    expect(stores.unregister).toHaveBeenCalledTimes(2)
    expect(stores.unregister).toHaveBeenNthCalledWith(1, 'nd-plugin:a')
    expect(stores.unregister).toHaveBeenNthCalledWith(2, 'nd-plugin:b')
    expect(stores.ctx.registeredCommandIds).toEqual([])
  })
})
