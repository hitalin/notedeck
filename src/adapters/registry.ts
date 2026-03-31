import { createMisskeyAdapter } from './misskey'
import type { ServerAdapter, ServerInfo, ServerSoftware } from './types'

type AdapterFactory = (
  info: ServerInfo,
  accountId: string,
  hasToken?: boolean,
) => ServerAdapter

const registry = new Map<ServerSoftware, AdapterFactory>()

export function registerAdapter(
  software: ServerSoftware,
  factory: AdapterFactory,
): void {
  registry.set(software, factory)
}

/**
 * Resolve a nodeinfo software name to a registered ServerSoftware.
 * Misskey を名乗るフォーク（名前に "misskey" を含む）のみ 'misskey' として認識。
 */
export function resolveSoftware(name: string): ServerSoftware {
  const n = name.toLowerCase()
  if (n === 'misskey' || n.includes('misskey')) return 'misskey'
  return 'unknown'
}

export function createAdapter(
  info: ServerInfo,
  accountId: string,
  hasToken = true,
): ServerAdapter {
  const factory = registry.get(info.software) ?? registry.get('misskey')
  if (!factory) {
    throw new Error(
      `No adapter registered for "${info.software}" and no fallback "misskey" adapter found`,
    )
  }
  return factory(info, accountId, hasToken)
}

export function getRegisteredSoftware(): ServerSoftware[] {
  return [...registry.keys()]
}

registerAdapter('misskey', createMisskeyAdapter)
