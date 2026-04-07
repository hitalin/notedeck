import { commands, unwrap } from '@/utils/tauriInvoke'
import type { AuthAdapter, AuthSession } from '../types'

export class MisskeyAuth implements AuthAdapter {
  async startAuth(host: string, permissions?: string[]): Promise<AuthSession> {
    return unwrap(await commands.authStart(host, permissions ?? null))
  }
}
