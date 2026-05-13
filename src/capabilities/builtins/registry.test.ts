import { describe, expect, it } from 'vitest'
import {
  REGISTRY_BUILTIN_CAPABILITIES,
  registryDeleteCapability,
  registryGetCapability,
  registryListKeysCapability,
  registrySetCapability,
} from './registry'

describe('registry capabilities — declaration', () => {
  it('registry.listKeys: account.read, cheap', () => {
    expect(registryListKeysCapability.id).toBe('registry.listKeys')
    expect(registryListKeysCapability.permissions).toEqual(['account.read'])
    expect(registryListKeysCapability.signature?.cheap).toBe(true)
    expect(
      registryListKeysCapability.signature?.params?.scope?.optional,
    ).not.toBe(true)
  })

  it('registry.get: account.read, cheap, requires scope+key', () => {
    expect(registryGetCapability.id).toBe('registry.get')
    expect(registryGetCapability.permissions).toEqual(['account.read'])
    expect(registryGetCapability.signature?.cheap).toBe(true)
    expect(registryGetCapability.signature?.params?.key?.optional).not.toBe(
      true,
    )
  })

  it('registry.set: account.write + warning confirmation', () => {
    expect(registrySetCapability.id).toBe('registry.set')
    expect(registrySetCapability.permissions).toEqual(['account.write'])
    expect(typeof registrySetCapability.requiresConfirmation).toBe('function')
  })

  it('registry.delete: account.write + danger confirmation', async () => {
    expect(registryDeleteCapability.id).toBe('registry.delete')
    expect(registryDeleteCapability.permissions).toEqual(['account.write'])
    expect(typeof registryDeleteCapability.requiresConfirmation).toBe(
      'function',
    )
    const confirm = registryDeleteCapability.requiresConfirmation
    if (typeof confirm !== 'function') throw new Error('expected function')
    const opts = await confirm({ scope: ['client'], key: 'theme' })
    expect(opts?.type).toBe('danger')
    expect(opts?.message).toContain('client/theme')
  })

  it('registry.set confirmation: warning type with scope/key in message', async () => {
    const confirm = registrySetCapability.requiresConfirmation
    if (typeof confirm !== 'function') throw new Error('expected function')
    const opts = await confirm({
      scope: ['client'],
      key: 'theme',
      value: { foo: 'bar' },
    })
    expect(opts?.type).toBe('warning')
    expect(opts?.codeLanguage).toBe('json')
    expect(opts?.message).toContain('Misskey 公式')
  })

  it('parseScope rejects non-array / non-string entries', async () => {
    await expect(
      registryListKeysCapability.execute({ scope: 'not-array' }),
    ).rejects.toThrow(/scope must be a string array/)
    await expect(
      registryListKeysCapability.execute({ scope: [123] }),
    ).rejects.toThrow(/scope entries must be non-empty strings/)
  })

  it('registry.set requires key + value', async () => {
    await expect(
      registrySetCapability.execute({ scope: ['client'] }),
    ).rejects.toThrow(/key is required/)
    await expect(
      registrySetCapability.execute({ scope: ['client'], key: 'k' }),
    ).rejects.toThrow(/value is required/)
  })
})

describe('REGISTRY_BUILTIN_CAPABILITIES', () => {
  it('contains listKeys / get / set / delete', () => {
    const ids = REGISTRY_BUILTIN_CAPABILITIES.map((c) => c.id).sort()
    expect(ids).toEqual([
      'registry.delete',
      'registry.get',
      'registry.listKeys',
      'registry.set',
    ])
  })
})
