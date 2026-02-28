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
})
