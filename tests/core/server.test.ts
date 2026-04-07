import { afterEach, describe, expect, it, vi } from 'vitest'
import { detectServer } from '@/core/server'

vi.mock('@/utils/tauriInvoke', () => ({
  commands: {
    fetchNodeinfo: vi.fn(),
    fetchServerMeta: vi.fn(),
  },
  unwrap: (result: { status: string; data?: unknown; error?: unknown }) => {
    if (result.status === 'ok') return result.data
    throw result.error
  },
}))

import { commands } from '@/utils/tauriInvoke'

describe('server detection', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  function mockServer(softwareName: string, version = '2025.1.0') {
    vi.mocked(commands.fetchNodeinfo).mockResolvedValue({
      status: 'ok',
      data: { software: { name: softwareName, version } },
    } as never)
    vi.mocked(commands.fetchServerMeta).mockResolvedValue({
      status: 'ok',
      data: { iconUrl: null },
    } as never)
  }

  it('detects misskey server', async () => {
    mockServer('misskey')
    const info = await detectServer('example.com')

    expect(info.host).toBe('example.com')
    expect(info.software).toBe('misskey-dev/misskey')
    expect(info.version).toBe('2025.1.0')
    expect(info.features.reactions).toBe(true)
  })

  it('detects yamisskey server', async () => {
    mockServer('yamisskey')
    const info = await detectServer('yami.ski')

    expect(info.software).toBe('yamisskey-dev/yamisskey')
  })

  it('detects misskey-tepura server', async () => {
    mockServer('misskey-tepura')
    const info = await detectServer('misskey.vip')

    expect(info.software).toBe('lqvp/misskey-tepura')
  })

  it('returns unknown for non-misskey software', async () => {
    mockServer('mastodon')
    const info = await detectServer('masto.example.com')

    expect(info.software).toBe('unknown')
  })

  it('throws when nodeinfo fetch fails', async () => {
    vi.mocked(commands.fetchNodeinfo).mockResolvedValue({
      status: 'error',
      error: { code: 'NETWORK', message: 'No nodeinfo URL found' },
    } as never)
    vi.mocked(commands.fetchServerMeta).mockResolvedValue({
      status: 'ok',
      data: { iconUrl: null },
    } as never)

    await expect(detectServer('bad.example.com')).rejects.toMatchObject({
      message: 'No nodeinfo URL found',
    })
  })
})
