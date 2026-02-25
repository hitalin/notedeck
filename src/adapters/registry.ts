import { createMisskeyAdapter } from './misskey'
import type { ServerAdapter, ServerInfo, ServerSoftware } from './types'

type AdapterFactory = (info: ServerInfo, accountId: string) => ServerAdapter

const registry = new Map<ServerSoftware, AdapterFactory>()

export function registerAdapter(
  software: ServerSoftware,
  factory: AdapterFactory,
): void {
  registry.set(software, factory)
}

export function createAdapter(
  info: ServerInfo,
  accountId: string,
): ServerAdapter {
  const factory = registry.get(info.software) ?? registry.get('misskey')
  if (!factory) {
    throw new Error(
      `No adapter registered for "${info.software}" and no fallback "misskey" adapter found`,
    )
  }
  return factory(info, accountId)
}

export function getRegisteredSoftware(): ServerSoftware[] {
  return [...registry.keys()]
}

registerAdapter('misskey', createMisskeyAdapter)
