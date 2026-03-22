import { invoke } from '@/utils/tauriInvoke'
import type { AuthAdapter, AuthSession } from '../types'

export class MisskeyAuth implements AuthAdapter {
  async startAuth(host: string, permissions?: string[]): Promise<AuthSession> {
    return invoke('auth_start', {
      host,
      permissions: permissions ?? null,
    })
  }
}
