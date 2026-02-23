import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '@/db'
import { useServersStore } from '@/stores/servers'

vi.mock('@/core/server', () => ({
  detectServer: vi.fn(),
}))

import { detectServer } from '@/core/server'

function createMockServerInfo(host = 'example.com') {
  return {
    host,
    software: 'misskey' as const,
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

describe('servers store', () => {
  beforeEach(async () => {
    setActivePinia(createPinia())
    await db.servers.clear()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('fetches and caches server info', async () => {
    const store = useServersStore()
    const mockInfo = createMockServerInfo()
    vi.mocked(detectServer).mockResolvedValue(mockInfo)

    const info = await store.getServerInfo('example.com')

    expect(info.software).toBe('misskey')
    expect(info.host).toBe('example.com')
    expect(detectServer).toHaveBeenCalledWith('example.com')
  })

  it('returns cached server info on second call', async () => {
    const store = useServersStore()
    const mockInfo = createMockServerInfo()
    vi.mocked(detectServer).mockResolvedValue(mockInfo)

    await store.getServerInfo('example.com')
    const info = await store.getServerInfo('example.com')

    expect(info.software).toBe('misskey')
    expect(detectServer).toHaveBeenCalledTimes(1)
  })

  it('returns undefined for unknown server via getServer', () => {
    const store = useServersStore()
    expect(store.getServer('unknown.com')).toBeUndefined()
  })
})
