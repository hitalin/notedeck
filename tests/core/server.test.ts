import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { detectServer } from '@/core/server'

describe('server detection', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn<
        (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
      >(),
    )
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  function mockNodeInfoFlow(softwareName: string, version = '2025.1.0') {
    vi.mocked(fetch)
      .mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            links: [
              {
                rel: 'http://nodeinfo.diaspora.software/ns/schema/2.0',
                href: 'https://example.com/nodeinfo/2.0',
              },
            ],
          }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            software: { name: softwareName, version },
          }),
      } as Response)
  }

  it('detects misskey server', async () => {
    mockNodeInfoFlow('misskey')
    const info = await detectServer('example.com')

    expect(info.host).toBe('example.com')
    expect(info.software).toBe('misskey')
    expect(info.version).toBe('2025.1.0')
    expect(info.features.reactions).toBe(true)
  })

  it('treats misskey forks as misskey', async () => {
    mockNodeInfoFlow('yamisskey')
    const info = await detectServer('yami.example.com')

    expect(info.software).toBe('misskey')
  })

  it('returns unknown for non-misskey software', async () => {
    mockNodeInfoFlow('mastodon')
    const info = await detectServer('masto.example.com')

    expect(info.software).toBe('unknown')
  })

  it('throws when nodeinfo link is missing', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ links: [] }),
    } as Response)

    await expect(detectServer('bad.example.com')).rejects.toThrow(
      'No nodeinfo URL found',
    )
  })
})
