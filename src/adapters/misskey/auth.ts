import { invoke } from '@tauri-apps/api/core'
import type { AuthAdapter, AuthSession } from '../types'

export class MisskeyAuth implements AuthAdapter {
  async startAuth(host: string, permissions?: string[]): Promise<AuthSession> {
    return invoke('auth_start', {
      host,
      permissions: permissions ?? null,
    })
  }
}
