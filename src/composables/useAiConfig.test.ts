import { describe, expect, it } from 'vitest'
import {
  _internal,
  type AiConfig,
  type DataSourcesConfig,
  defaultConfig,
  type PermissionsConfig,
  resolveDataSources,
  resolvePermissions,
  setDataSourcePreset,
  setPermissionPreset,
} from './useAiConfig'

const { mergeConfig } = _internal

describe('defaultConfig', () => {
  it('returns readonly preset for both permissions and dataSources', () => {
    const cfg = defaultConfig()
    expect(cfg.permissions.preset).toBe('readonly')
    expect(cfg.dataSources.preset).toBe('readonly')
  })

  it('default permissions allow only read operations', () => {
    const resolved = resolvePermissions(defaultConfig().permissions)
    expect(resolved['notes.read']).toBe(true)
    expect(resolved['account.read']).toBe(true)
    expect(resolved['drive.read']).toBe(true)
    expect(resolved['notes.write']).toBe(false)
    expect(resolved['account.write']).toBe(false)
    expect(resolved['network.external']).toBe(false)
  })

  it('default dataSources include account/column but not visibleNotes/recentConversation', () => {
    const resolved = resolveDataSources(defaultConfig().dataSources)
    expect(resolved.currentAccount).toBe(true)
    expect(resolved.currentColumn).toBe(true)
    expect(resolved.visibleNotes).toBe(false)
    expect(resolved.recentConversation).toBe(false)
  })
})

describe('resolvePermissions / resolveDataSources', () => {
  it('safe preset enables react/clipboard/notifications but not write operations', () => {
    const resolved = resolvePermissions({
      preset: 'safe',
      custom: {} as PermissionsConfig['custom'],
    })
    expect(resolved['notes.react']).toBe(true)
    expect(resolved.clipboard).toBe(true)
    expect(resolved.notifications).toBe(true)
    expect(resolved['notes.write']).toBe(false)
    expect(resolved['network.external']).toBe(false)
  })

  it('full preset enables all permissions including network.external', () => {
    const resolved = resolvePermissions({
      preset: 'full',
      custom: {} as PermissionsConfig['custom'],
    })
    expect(resolved['notes.write']).toBe(true)
    expect(resolved['account.write']).toBe(true)
    expect(resolved['drive.write']).toBe(true)
    expect(resolved['network.external']).toBe(true)
  })

  it('custom preset returns the custom map verbatim', () => {
    const resolved = resolvePermissions({
      preset: 'custom',
      custom: {
        'notes.read': true,
        'notes.write': false,
        'notes.react': true,
        'account.read': true,
        'account.write': false,
        'drive.read': true,
        'drive.write': false,
        'network.external': true,
        clipboard: false,
        notifications: false,
      },
    })
    expect(resolved['network.external']).toBe(true)
    expect(resolved['notes.react']).toBe(true)
    expect(resolved['account.write']).toBe(false)
  })
})

describe('setPermissionPreset / setDataSourcePreset', () => {
  it('switching from readonly to safe replaces custom with safe defaults', () => {
    const next = setPermissionPreset(defaultConfig().permissions, 'safe')
    expect(next.preset).toBe('safe')
    expect(next.custom['notes.react']).toBe(true)
    expect(next.custom.clipboard).toBe(true)
  })

  it('switching to custom pre-fills custom from the previously resolved preset', () => {
    // Start at 'safe' (resolved values), switch to 'custom'.
    const safe: PermissionsConfig = {
      preset: 'safe',
      custom: {} as PermissionsConfig['custom'],
    }
    const next = setPermissionPreset(safe, 'custom')
    expect(next.preset).toBe('custom')
    // Pre-filled with safe's resolved values
    expect(next.custom['notes.react']).toBe(true)
    expect(next.custom.clipboard).toBe(true)
    expect(next.custom['notes.write']).toBe(false)
  })

  it('switching dataSources to full enables visibleNotes and recentConversation', () => {
    const next = setDataSourcePreset(defaultConfig().dataSources, 'full')
    expect(next.preset).toBe('full')
    expect(next.custom.visibleNotes).toBe(true)
    expect(next.custom.recentConversation).toBe(true)
  })
})

describe('mergeConfig', () => {
  it('legacy ai.json5 without permissions/dataSources is filled with defaults', () => {
    const partial: Partial<AiConfig> = {
      provider: 'openai',
      openai: { endpoint: 'https://api.example.com', model: 'gpt-test' },
    }
    const merged = mergeConfig(defaultConfig(), partial)
    expect(merged.provider).toBe('openai')
    expect(merged.openai.model).toBe('gpt-test')
    // Permissions/dataSources fall back to defaults (readonly preset)
    expect(merged.permissions.preset).toBe('readonly')
    expect(merged.dataSources.preset).toBe('readonly')
    expect(merged.permissions.custom['notes.read']).toBe(true)
  })

  it('partial permissions.custom values are deep-merged with defaults', () => {
    const partial: Partial<AiConfig> = {
      permissions: {
        preset: 'custom',
        custom: { 'notes.write': true } as PermissionsConfig['custom'],
      },
    }
    const merged = mergeConfig(defaultConfig(), partial)
    expect(merged.permissions.preset).toBe('custom')
    // Overridden key
    expect(merged.permissions.custom['notes.write']).toBe(true)
    // Default key preserved
    expect(merged.permissions.custom['notes.read']).toBe(true)
    expect(merged.permissions.custom['network.external']).toBe(false)
  })

  it('partial dataSources.preset only applies preset, custom defaults preserved', () => {
    const partial: Partial<AiConfig> = {
      dataSources: {
        preset: 'safe',
      } as Partial<DataSourcesConfig> as DataSourcesConfig,
    }
    const merged = mergeConfig(defaultConfig(), partial)
    expect(merged.dataSources.preset).toBe('safe')
    // custom is preserved from defaults (readonly's custom)
    expect(merged.dataSources.custom.currentAccount).toBe(true)
  })
})
