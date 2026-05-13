import { describe, expect, it } from 'vitest'
import {
  PLUGINS_BUILTIN_CAPABILITIES,
  pluginsCreateCapability,
  pluginsDeleteCapability,
  pluginsListCapability,
  pluginsReadCapability,
  pluginsSetActiveCapability,
  pluginsUpdateCapability,
} from './plugins'

// Note: execute は usePluginsStore (Pinia) に依存するため store mock 抜きでは
// 走らない。capability 定義 (id / permissions / aiTool / requiresConfirmation)
// と引数バリデーションのみ検証する。

describe('plugin capabilities — declaration', () => {
  it('plugins.list: read permission, cheap, aiTool true', () => {
    expect(pluginsListCapability.id).toBe('plugins.list')
    expect(pluginsListCapability.permissions).toEqual(['plugins.read'])
    expect(pluginsListCapability.aiTool).toBe(true)
    expect(pluginsListCapability.signature?.cheap).toBe(true)
  })

  it('plugins.read: read permission, requires installId', () => {
    expect(pluginsReadCapability.id).toBe('plugins.read')
    expect(pluginsReadCapability.permissions).toEqual(['plugins.read'])
    expect(pluginsReadCapability.aiTool).toBe(true)
    expect(() => pluginsReadCapability.execute({})).toThrow(
      /installId is required/,
    )
  })

  it('plugins.create: write permission, aiTool:true, install preview confirmation', () => {
    expect(pluginsCreateCapability.id).toBe('plugins.create')
    expect(pluginsCreateCapability.permissions).toEqual(['plugins.write'])
    expect(pluginsCreateCapability.aiTool).toBe(true)
    expect(typeof pluginsCreateCapability.requiresConfirmation).toBe('function')
    expect(() => pluginsCreateCapability.execute({})).toThrow(
      /name is required/,
    )
    expect(() => pluginsCreateCapability.execute({ name: 'X' })).toThrow(
      /src is required/,
    )
  })

  it('plugins.create: requiresConfirmation builds installPreview kind=plugin', () => {
    if (typeof pluginsCreateCapability.requiresConfirmation !== 'function') {
      throw new Error('requiresConfirmation must be a function')
    }
    const opts = pluginsCreateCapability.requiresConfirmation({
      name: 'demo',
      src: 'sample',
      version: '1.2.3',
      author: 'AI',
      description: 'desc',
      permissions: ['write:notes'],
    })
    expect(opts?.installPreview?.kind).toBe('plugin')
    expect(opts?.installPreview?.name).toBe('demo')
    expect(opts?.installPreview?.version).toBe('1.2.3')
    expect(opts?.installPreview?.author).toBe('AI')
    expect(opts?.installPreview?.permissions).toEqual(['write:notes'])
    expect(opts?.code).toBe('sample')
    expect(opts?.codeLanguage).toBe('is')
  })

  it('plugins.update: write permission, aiTool:true, install preview confirmation', () => {
    expect(pluginsUpdateCapability.id).toBe('plugins.update')
    expect(pluginsUpdateCapability.permissions).toEqual(['plugins.write'])
    expect(pluginsUpdateCapability.aiTool).toBe(true)
    expect(typeof pluginsUpdateCapability.requiresConfirmation).toBe('function')
    expect(() => pluginsUpdateCapability.execute({})).toThrow(
      /installId is required/,
    )
    expect(() => pluginsUpdateCapability.execute({ installId: 'x' })).toThrow(
      /src is required/,
    )
  })

  it('plugins.setActive: write permission, aiTool:false (= AI が勝手に有効化させない)', () => {
    expect(pluginsSetActiveCapability.id).toBe('plugins.setActive')
    expect(pluginsSetActiveCapability.permissions).toEqual(['plugins.write'])
    expect(pluginsSetActiveCapability.aiTool).toBe(false)
    expect(pluginsSetActiveCapability.requiresConfirmation).not.toBe(true)
  })

  it('plugins.delete: write permission, aiTool:false, requires confirmation (= 不可逆)', () => {
    expect(pluginsDeleteCapability.id).toBe('plugins.delete')
    expect(pluginsDeleteCapability.permissions).toEqual(['plugins.write'])
    expect(pluginsDeleteCapability.aiTool).toBe(false)
    expect(pluginsDeleteCapability.requiresConfirmation).toBe(true)
    expect(() => pluginsDeleteCapability.execute({})).toThrow(
      /installId is required/,
    )
  })

  it('plugins.create: optional metadata fields (active param is removed — AI 経由で active true にできない)', () => {
    const params = pluginsCreateCapability.signature?.params
    expect(params?.name?.optional).not.toBe(true)
    expect(params?.src?.optional).not.toBe(true)
    expect(params?.version?.optional).toBe(true)
    expect(params?.author?.optional).toBe(true)
    expect(params?.description?.optional).toBe(true)
    expect(params?.permissions?.optional).toBe(true)
    expect(params?.active).toBeUndefined()
  })
})

describe('PLUGINS_BUILTIN_CAPABILITIES', () => {
  it('contains all 8 plugin capabilities (incl. history / revert)', () => {
    const ids = PLUGINS_BUILTIN_CAPABILITIES.map((c) => c.id).sort()
    expect(ids).toEqual([
      'plugins.create',
      'plugins.delete',
      'plugins.history',
      'plugins.list',
      'plugins.read',
      'plugins.revert',
      'plugins.setActive',
      'plugins.update',
    ])
  })

  it('create / update は aiTool:true、setActive / delete / revert は aiTool:false', () => {
    const getCap = (id: string) => {
      const cap = PLUGINS_BUILTIN_CAPABILITIES.find((c) => c.id === id)
      if (!cap) throw new Error(`capability ${id} not found`)
      return cap
    }
    expect(getCap('plugins.create').aiTool).toBe(true)
    expect(getCap('plugins.update').aiTool).toBe(true)
    // handler 有効化・不可逆削除・履歴ロールバックは AI 自発呼出し禁止
    expect(getCap('plugins.setActive').aiTool).toBe(false)
    expect(getCap('plugins.delete').aiTool).toBe(false)
    expect(getCap('plugins.revert').aiTool).toBe(false)
  })

  it('read capabilities are aiTool: true (= AI が確認できる)', () => {
    const readCaps = PLUGINS_BUILTIN_CAPABILITIES.filter(
      (c) =>
        c.permissions?.includes('plugins.read') &&
        !c.permissions.includes('plugins.write'),
    )
    expect(readCaps.length).toBeGreaterThan(0)
    for (const cap of readCaps) {
      expect(cap.aiTool, `${cap.id} should be aiTool:true`).toBe(true)
    }
  })
})
