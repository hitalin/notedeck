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
    // Use URL-based matching since fetchNodeInfo and fetchIconUrl run in parallel
    vi.mocked(fetch).mockImplementation((input: RequestInfo | URL) => {
      const url = String(input)
      if (url.includes('.well-known/nodeinfo')) {
        // Extract host from the request URL so the nodeinfo href matches (SSRF validation)
        const host = new URL(url).hostname
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              links: [
                {
                  rel: 'http://nodeinfo.diaspora.software/ns/schema/2.0',
                  href: `https://${host}/nodeinfo/2.0`,
                },
              ],
            }),
        } as Response)
      }
      if (url.includes('/nodeinfo/')) {
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              software: { name: softwareName, version },
            }),
        } as Response)
      }
      if (url.includes('/api/meta')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ iconUrl: null }),
        } as Response)
      }
      return Promise.reject(new Error(`Unexpected fetch: ${url}`))
    })
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
    vi.mocked(fetch).mockImplementation((input: RequestInfo | URL) => {
      const url = String(input)
      if (url.includes('.well-known/nodeinfo')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ links: [] }),
        } as Response)
      }
      if (url.includes('/api/meta')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ iconUrl: null }),
        } as Response)
      }
      return Promise.reject(new Error(`Unexpected fetch: ${url}`))
    })

    await expect(detectServer('bad.example.com')).rejects.toThrow(
      'No nodeinfo URL found',
    )
  })
})
