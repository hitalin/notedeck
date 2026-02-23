import type {
  AuthAdapter,
  AuthResult,
  AuthSession,
  NormalizedUser,
} from '../types'

const APP_NAME = 'notedeck'

const DEFAULT_PERMISSIONS = [
  'read:account',
  'read:blocks',
  'read:drive',
  'read:favorites',
  'read:following',
  'read:messaging',
  'read:mutes',
  'read:notifications',
  'read:reactions',
  'write:drive',
  'write:favorites',
  'write:following',
  'write:messaging',
  'write:mutes',
  'write:notes',
  'write:notifications',
  'write:reactions',
  'write:votes',
]

export class MisskeyAuth implements AuthAdapter {
  async startAuth(
    host: string,
    permissions: string[] = DEFAULT_PERMISSIONS,
  ): Promise<AuthSession> {
    const sessionId = crypto.randomUUID()
    const params = new URLSearchParams({
      name: APP_NAME,
      permission: permissions.join(','),
    })
    const url = `https://${host}/miauth/${sessionId}?${params.toString()}`

    return { sessionId, url, host }
  }

  async completeAuth(session: AuthSession): Promise<AuthResult> {
    const res = await fetch(
      `https://${session.host}/api/miauth/${session.sessionId}/check`,
      { method: 'POST' },
    )

    if (!res.ok) {
      throw new Error(`MiAuth check failed: ${res.status}`)
    }

    const data: { ok: boolean; token: string; user: MisskeyUser } =
      await res.json()

    if (!data.ok) {
      throw new Error('MiAuth authentication was not completed')
    }

    return {
      token: data.token,
      user: normalizeUser(data.user),
    }
  }

  async verifyToken(host: string, token: string): Promise<NormalizedUser> {
    const res = await fetch(`https://${host}/api/i`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ i: token }),
    })

    if (!res.ok) {
      throw new Error(`Token verification failed: ${res.status}`)
    }

    const user: MisskeyUser = await res.json()
    return normalizeUser(user)
  }
}

interface MisskeyUser {
  id: string
  username: string
  host: string | null
  name: string | null
  avatarUrl: string | null
}

function normalizeUser(user: MisskeyUser): NormalizedUser {
  return {
    id: user.id,
    username: user.username,
    host: user.host,
    name: user.name,
    avatarUrl: user.avatarUrl,
  }
}
