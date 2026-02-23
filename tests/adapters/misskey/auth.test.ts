import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MisskeyAuth } from '@/adapters/misskey/auth'

describe('MisskeyAuth', () => {
  const auth = new MisskeyAuth()

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

  describe('startAuth', () => {
    it('returns a session with MiAuth URL', async () => {
      const session = await auth.startAuth('example.com')

      expect(session.host).toBe('example.com')
      expect(session.sessionId).toBeTruthy()
      expect(session.url).toContain('https://example.com/miauth/')
      expect(session.url).toContain(session.sessionId)
      expect(session.url).toContain('name=notedeck')
    })

    it('includes requested permissions in URL', async () => {
      const session = await auth.startAuth('example.com', [
        'read:account',
        'write:notes',
      ])

      expect(session.url).toContain('permission=read%3Aaccount%2Cwrite%3Anotes')
    })
  })

  describe('completeAuth', () => {
    it('returns token and normalized user on success', async () => {
      const mockResponse = {
        ok: true,
        token: 'abc123',
        user: {
          id: 'user-1',
          username: 'testuser',
          host: null,
          name: 'Test User',
          avatarUrl: 'https://example.com/avatar.png',
        },
      }

      vi.mocked(fetch).mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      } as Response)

      const result = await auth.completeAuth({
        sessionId: 'session-1',
        url: 'https://example.com/miauth/session-1',
        host: 'example.com',
      })

      expect(result.token).toBe('abc123')
      expect(result.user.id).toBe('user-1')
      expect(result.user.username).toBe('testuser')
      expect(result.user.avatarUrl).toBe('https://example.com/avatar.png')

      expect(fetch).toHaveBeenCalledWith(
        'https://example.com/api/miauth/session-1/check',
        { method: 'POST' },
      )
    })

    it('throws on HTTP error', async () => {
      vi.mocked(fetch).mockResolvedValue({
        ok: false,
        status: 500,
      } as Response)

      await expect(
        auth.completeAuth({
          sessionId: 's1',
          url: 'https://example.com/miauth/s1',
          host: 'example.com',
        }),
      ).rejects.toThrow('MiAuth check failed: 500')
    })

    it('throws when auth not completed', async () => {
      vi.mocked(fetch).mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ ok: false }),
      } as Response)

      await expect(
        auth.completeAuth({
          sessionId: 's1',
          url: 'https://example.com/miauth/s1',
          host: 'example.com',
        }),
      ).rejects.toThrow('MiAuth authentication was not completed')
    })
  })

  describe('verifyToken', () => {
    it('returns normalized user', async () => {
      const mockUser = {
        id: 'user-1',
        username: 'testuser',
        host: null,
        name: 'Test User',
        avatarUrl: null,
      }

      vi.mocked(fetch).mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockUser),
      } as Response)

      const user = await auth.verifyToken('example.com', 'token-123')

      expect(user.id).toBe('user-1')
      expect(user.username).toBe('testuser')

      expect(fetch).toHaveBeenCalledWith('https://example.com/api/i', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ i: 'token-123' }),
      })
    })

    it('throws on invalid token', async () => {
      vi.mocked(fetch).mockResolvedValue({
        ok: false,
        status: 401,
      } as Response)

      await expect(
        auth.verifyToken('example.com', 'bad-token'),
      ).rejects.toThrow('Token verification failed: 401')
    })
  })
})
