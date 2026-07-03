import type { QueryKey } from '@/bindings'

/**
 * queryId -> {flavor, accountId} レジストリ。
 *
 * AiScript プラグインの `Nd:on('note:new' / 'notification:new')` fan-out
 * (src/aiscript/events.ts) が queryDelta を振り分けるために参照する。
 * 登録は実稼働の購読経路 createQuerySubscription (adapters/misskey/query.ts)
 * が行う。aiscript/events.ts に置くと adapters → aiscript → stores →
 * adapters の循環 import になるため core に切り出している。
 */

export type QueryFlavor = 'note' | 'notification'

export interface QueryInfo {
  flavor: QueryFlavor
  accountId: string
}

const queryInfoByQueryId = new Map<string, QueryInfo>()

export function registerQuery(queryId: string, key: QueryKey): void {
  const info = queryKeyToInfo(key)
  if (info) queryInfoByQueryId.set(queryId, info)
}

export function unregisterQuery(queryId: string): void {
  queryInfoByQueryId.delete(queryId)
}

export function getQueryInfo(queryId: string): QueryInfo | undefined {
  return queryInfoByQueryId.get(queryId)
}

function queryKeyToInfo(key: QueryKey): QueryInfo | null {
  switch (key.kind) {
    case 'timeline':
    case 'antenna':
    case 'channel':
    case 'role':
    case 'mentions':
      return { flavor: 'note', accountId: key.account_id }
    case 'notifications':
      return { flavor: 'notification', accountId: key.account_id }
    // chat 系 (chatUser / chatRoom) は DM 性質のため note:new から除外。
    // 必要なら 'chat:new' を別途設計する。
    default:
      return null
  }
}

/** @internal テスト用。 */
export function _resetQueryRegistryForTest(): void {
  queryInfoByQueryId.clear()
}
