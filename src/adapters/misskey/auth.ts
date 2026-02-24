import { invoke } from '@tauri-apps/api/core'
import type {
  AuthAdapter,
  AuthResult,
  AuthSession,
  NormalizedUser,
} from '../types'

export class MisskeyAuth implements AuthAdapter {
  async startAuth(
    host: string,
    permissions?: string[],
  ): Promise<AuthSession> {
    return invoke('auth_start', {
      host,
      permissions: permissions ?? null,
    })
  }

  async completeAuth(session: AuthSession): Promise<AuthResult> {
    return invoke('auth_complete', { session })
  }

  async verifyToken(host: string, token: string): Promise<NormalizedUser> {
    return invoke('auth_verify_token', { host, token })
  }
}
