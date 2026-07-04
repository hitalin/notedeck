import { describe, expect, it } from 'vitest'
import {
  _internal,
  type AiConfig,
  DATA_SOURCE_KEYS,
  type DataSourcesConfig,
  defaultConfig,
  HEARTBEAT_INTERVAL_DEFAULT_MINUTES,
  HEARTBEAT_INTERVAL_MAX_MINUTES,
  HEARTBEAT_INTERVAL_MIN_MINUTES,
  type HeartbeatConfig,
  resolveDataSources,
  setDataSourcePreset,
} from './useAiConfig'

// 権限系 (resolvePermissions / preset 定義 / PermissionsConfig) のテストは
// #712 PR 1b で src/permissions/schema.test.ts へ移動した。

const { mergeConfig } = _internal

describe('defaultConfig', () => {
  it('returns readonly preset for dataSources', () => {
    const cfg = defaultConfig()
    expect(cfg.dataSources.preset).toBe('readonly')
  })

  it('default dataSources include account/column/memos but not visibleNotes/recentConversation', () => {
    const resolved = resolveDataSources(defaultConfig().dataSources)
    expect(resolved.currentAccount).toBe(true)
    expect(resolved.currentColumn).toBe(true)
    expect(resolved.visibleNotes).toBe(false)
    expect(resolved.recentConversation).toBe(false)
    expect(resolved.memos).toBe(true)
  })

  it('権限プロファイルは ai.json5 から撤去済み (#712)', () => {
    const cfg = defaultConfig() as unknown as Record<string, unknown>
    expect(cfg.permissions).toBeUndefined()
    expect(cfg.httpApi).toBeUndefined()
    expect(
      (cfg.heartbeat as Record<string, unknown>).permissions,
    ).toBeUndefined()
  })
})

describe('setDataSourcePreset', () => {
  it('switching dataSources to full enables visibleNotes and recentConversation', () => {
    const next = setDataSourcePreset(defaultConfig().dataSources, 'full')
    expect(next.preset).toBe('full')
    expect(next.custom.visibleNotes).toBe(true)
    expect(next.custom.recentConversation).toBe(true)
    expect(next.custom.memos).toBe(true)
  })

  it('safe preset enables memos (PKM 用 markdown はユーザー自身の note として送って良い)', () => {
    const next = setDataSourcePreset(defaultConfig().dataSources, 'safe')
    expect(next.preset).toBe('safe')
    expect(next.custom.memos).toBe(true)
  })
})

describe('preset key coverage', () => {
  it.each([
    'readonly',
    'safe',
    'full',
  ] as const)('every DATA_SOURCE_KEYS entry has a boolean in the %s preset', (preset) => {
    const resolved = resolveDataSources({
      preset,
      custom: {} as DataSourcesConfig['custom'],
    })
    for (const key of DATA_SOURCE_KEYS) {
      expect(typeof resolved[key], `dataSources.${key} on ${preset}`).toBe(
        'boolean',
      )
    }
  })
})

describe('mergeConfig', () => {
  it('ai.json5 without dataSources is filled with defaults', () => {
    const partial: Partial<AiConfig> = {
      activeConnectionId: '01HXXXXXXXXXXXXXXXXXXXXXXX',
      models: { '01HXXXXXXXXXXXXXXXXXXXXXXX': 'gpt-test' },
    }
    const merged = mergeConfig(defaultConfig(), partial)
    expect(merged.activeConnectionId).toBe('01HXXXXXXXXXXXXXXXXXXXXXXX')
    expect(merged.models['01HXXXXXXXXXXXXXXXXXXXXXXX']).toBe('gpt-test')
    expect(merged.dataSources.preset).toBe('readonly')
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

describe('heartbeat config (#411 Phase 6)', () => {
  it('default has enabled=false, interval=30, target=auto + cheap-check defaults', () => {
    const cfg = defaultConfig()
    expect(cfg.heartbeat.enabled).toBe(false)
    expect(cfg.heartbeat.intervalMinutes).toBe(30)
    expect(cfg.heartbeat.target).toBe('auto')
    // Cheap Check First (#411) defaults
    expect(cfg.heartbeat.cheapCheck.enabled).toBe(true)
    expect(cfg.heartbeat.cheapCheck.maxSkipHours).toBe(24)
    expect(cfg.heartbeat.dailyMaxAiRuns).toBe(48)
    expect(cfg.heartbeat.onDailyLimit).toBe('warn')
    // Desktop notification (#411 0.19.0)
    expect(cfg.heartbeat.desktopNotification).toBe(true)
    // 旧 field が混入していないこと (accountId / denyDuringHeartbeat / skills)
    expect(
      (cfg.heartbeat as unknown as Record<string, unknown>).accountId,
    ).toBeUndefined()
    expect(
      (cfg.heartbeat as unknown as Record<string, unknown>).denyDuringHeartbeat,
    ).toBeUndefined()
    expect(
      (cfg.heartbeat as unknown as Record<string, unknown>).skills,
    ).toBeUndefined()
  })

  it('mergeConfig keeps target from partial', () => {
    const partial: Partial<AiConfig> = {
      heartbeat: {
        target: 'sess-abc',
      } as Partial<HeartbeatConfig> as HeartbeatConfig,
    }
    const merged = mergeConfig(defaultConfig(), partial)
    expect(merged.heartbeat.target).toBe('sess-abc')
  })

  it('empty / null target falls back to "auto"', () => {
    const partial: Partial<AiConfig> = {
      heartbeat: {
        target: '',
      } as Partial<HeartbeatConfig> as HeartbeatConfig,
    }
    expect(mergeConfig(defaultConfig(), partial).heartbeat.target).toBe('auto')
  })

  it('mergeConfig deep-merges partial heartbeat fields', () => {
    const partial: Partial<AiConfig> = {
      heartbeat: {
        enabled: true,
        intervalMinutes: 15,
      } as Partial<HeartbeatConfig> as HeartbeatConfig,
    }
    const merged = mergeConfig(defaultConfig(), partial)
    expect(merged.heartbeat.enabled).toBe(true)
    expect(merged.heartbeat.intervalMinutes).toBe(15)
  })

  it('intervalMinutes is clamped to MIN..MAX', () => {
    const tooSmall: Partial<AiConfig> = {
      heartbeat: {
        intervalMinutes: 0,
      } as Partial<HeartbeatConfig> as HeartbeatConfig,
    }
    expect(
      mergeConfig(defaultConfig(), tooSmall).heartbeat.intervalMinutes,
    ).toBe(HEARTBEAT_INTERVAL_MIN_MINUTES)
    const tooBig: Partial<AiConfig> = {
      heartbeat: {
        intervalMinutes: 99999,
      } as Partial<HeartbeatConfig> as HeartbeatConfig,
    }
    expect(mergeConfig(defaultConfig(), tooBig).heartbeat.intervalMinutes).toBe(
      HEARTBEAT_INTERVAL_MAX_MINUTES,
    )
  })

  it('NaN intervalMinutes falls back to default', () => {
    const partial: Partial<AiConfig> = {
      heartbeat: {
        intervalMinutes: Number.NaN,
      } as Partial<HeartbeatConfig> as HeartbeatConfig,
    }
    expect(
      mergeConfig(defaultConfig(), partial).heartbeat.intervalMinutes,
    ).toBe(HEARTBEAT_INTERVAL_DEFAULT_MINUTES)
  })
})
