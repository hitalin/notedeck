import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}))

import { invoke } from '@tauri-apps/api/core'
import { MisskeyAuth } from '@/adapters/misskey/auth'

describe('MisskeyAuth', () => {
  const auth = new MisskeyAuth()

  beforeEach(() => {
    vi.mocked(invoke).mockReset()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('startAuth', () => {
    it('invokes auth_start and returns session', async () => {
      const mockSession = {
        sessionId: 'session-123',
        url: 'https://example.com/miauth/session-123?name=notedeck&permission=read:account',
        host: 'example.com',
      }
      vi.mocked(invoke).mockResolvedValue(mockSession)

      const session = await auth.startAuth('example.com')

      expect(session.host).toBe('example.com')
      expect(session.sessionId).toBe('session-123')
      expect(session.url).toContain('https://example.com/miauth/')

      expect(invoke).toHaveBeenCalledWith('auth_start', {
        host: 'example.com',
        permissions: null,
      })
    })

    it('passes custom permissions', async () => {
      vi.mocked(invoke).mockResolvedValue({
        sessionId: 's1',
        url: 'https://example.com/miauth/s1',
        host: 'example.com',
      })

      await auth.startAuth('example.com', ['read:account', 'write:notes'])

      expect(invoke).toHaveBeenCalledWith('auth_start', {
        host: 'example.com',
        permissions: ['read:account', 'write:notes'],
      })
    })
  })

  describe('completeAuth', () => {
    it('invokes auth_complete and returns token + user', async () => {
      const mockResult = {
        token: 'abc123',
        user: {
          id: 'user-1',
          username: 'testuser',
          host: null,
          name: 'Test User',
          avatarUrl: 'https://example.com/avatar.png',
        },
      }
      vi.mocked(invoke).mockResolvedValue(mockResult)

      const session = {
        sessionId: 'session-1',
        url: 'https://example.com/miauth/session-1',
        host: 'example.com',
      }
      const result = await auth.completeAuth(session)

      expect(result.token).toBe('abc123')
      expect(result.user.id).toBe('user-1')
      expect(result.user.username).toBe('testuser')

      expect(invoke).toHaveBeenCalledWith('auth_complete', { session })
    })

    it('propagates errors', async () => {
      vi.mocked(invoke).mockRejectedValue('MiAuth check failed: 500')

      await expect(
        auth.completeAuth({
          sessionId: 's1',
          url: 'https://example.com/miauth/s1',
          host: 'example.com',
        }),
      ).rejects.toBe('MiAuth check failed: 500')
    })
  })

  describe('verifyToken', () => {
    it('invokes auth_verify_token and returns user', async () => {
      const mockUser = {
        id: 'user-1',
        username: 'testuser',
        host: null,
        name: 'Test User',
        avatarUrl: null,
      }
      vi.mocked(invoke).mockResolvedValue(mockUser)

      const user = await auth.verifyToken('example.com', 'token-123')

      expect(user.id).toBe('user-1')
      expect(user.username).toBe('testuser')

      expect(invoke).toHaveBeenCalledWith('auth_verify_token', {
        host: 'example.com',
        token: 'token-123',
      })
    })

    it('propagates errors on invalid token', async () => {
      vi.mocked(invoke).mockRejectedValue('Token verification failed')

      await expect(
        auth.verifyToken('example.com', 'bad-token'),
      ).rejects.toBe('Token verification failed')
    })
  })
})
