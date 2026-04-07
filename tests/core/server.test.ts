import { afterEach, describe, expect, it, vi } from 'vitest'
import { detectServer } from '@/core/server'

vi.mock('@/utils/tauriInvoke', () => ({
  invoke: vi.fn(),
}))

import { invoke } from '@/utils/tauriInvoke'

describe('server detection', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  function mockInvoke(softwareName: string, version = '2025.1.0') {
    vi.mocked(invoke).mockImplementation((cmd: string) => {
      if (cmd === 'fetch_nodeinfo') {
        return Promise.resolve({
          software: { name: softwareName, version },
        })
      }
      if (cmd === 'fetch_server_meta') {
        return Promise.resolve({ iconUrl: null })
      }
      return Promise.reject(new Error(`Unexpected invoke: ${cmd}`))
    })
  }

  it('detects misskey server', async () => {
    mockInvoke('misskey')
    const info = await detectServer('example.com')

    expect(info.host).toBe('example.com')
    expect(info.software).toBe('misskey-dev/misskey')
    expect(info.version).toBe('2025.1.0')
    expect(info.features.reactions).toBe(true)
  })

  it('detects yamisskey server', async () => {
    mockInvoke('yamisskey')
    const info = await detectServer('yami.ski')

    expect(info.software).toBe('yamisskey-dev/yamisskey')
  })

  it('detects misskey-tepura server', async () => {
    mockInvoke('misskey-tepura')
    const info = await detectServer('misskey.vip')

    expect(info.software).toBe('lqvp/misskey-tepura')
  })

  it('returns unknown for non-misskey software', async () => {
    mockInvoke('mastodon')
    const info = await detectServer('masto.example.com')

    expect(info.software).toBe('unknown')
  })

  it('throws when nodeinfo fetch fails', async () => {
    vi.mocked(invoke).mockImplementation((cmd: string) => {
      if (cmd === 'fetch_nodeinfo') {
        return Promise.reject(new Error('No nodeinfo URL found'))
      }
      if (cmd === 'fetch_server_meta') {
        return Promise.resolve({ iconUrl: null })
      }
      return Promise.reject(new Error(`Unexpected invoke: ${cmd}`))
    })

    await expect(detectServer('bad.example.com')).rejects.toThrow(
      'No nodeinfo URL found',
    )
  })
})
