import type { ServerAdapter, ServerInfo } from '../types'
import { MisskeyApi } from './api'
import { MisskeyAuth } from './auth'
import { MisskeyStream } from './streaming'

export function createMisskeyAdapter(
  serverInfo: ServerInfo,
  token: string,
  accountId: string,
): ServerAdapter {
  return {
    serverInfo,
    auth: new MisskeyAuth(),
    api: new MisskeyApi(serverInfo.host, token, accountId),
    stream: new MisskeyStream(serverInfo.host, token, accountId),
  }
}
