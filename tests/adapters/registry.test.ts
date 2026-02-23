import { describe, expect, it } from 'vitest'
import { createAdapter, getRegisteredSoftware } from '@/adapters/registry'
import type { ServerInfo } from '@/adapters/types'

function createMockServerInfo(
  software: ServerInfo['software'] = 'misskey',
): ServerInfo {
  return {
    host: 'example.com',
    software,
    version: '2025.1.0',
    features: {
      mastodonApi: false,
      reactions: true,
      customEmoji: true,
      drive: true,
      channels: true,
      antennas: true,
      quotes: true,
    },
  }
}

describe('adapter registry', () => {
  it('creates a misskey adapter', () => {
    const adapter = createAdapter(createMockServerInfo(), 'token', 'account-1')
    expect(adapter).toBeDefined()
    expect(adapter.serverInfo.software).toBe('misskey')
  })

  it('falls back to misskey adapter for unknown software', () => {
    const adapter = createAdapter(
      createMockServerInfo('unknown'),
      'token',
      'account-1',
    )
    expect(adapter).toBeDefined()
  })

  it('lists registered software', () => {
    const registered = getRegisteredSoftware()
    expect(registered).toContain('misskey')
  })
})
