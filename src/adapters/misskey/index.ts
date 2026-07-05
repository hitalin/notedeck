import type { ServerAdapter, ServerInfo } from '../types'
import { createMisskeyApi } from './api'
import { MisskeyAuth } from './auth'
import { MisskeyStream } from './streaming'

export function createMisskeyAdapter(
  serverInfo: ServerInfo,
  accountId: string,
  hasToken = true,
): ServerAdapter {
  return {
    serverInfo,
    auth: new MisskeyAuth(),
    api: createMisskeyApi(accountId, serverInfo.host, hasToken),
    stream: new MisskeyStream(accountId),
  }
}
