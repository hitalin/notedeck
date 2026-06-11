import type { NormalizedNotification } from '@/adapters/types'
import {
  getStorageJson,
  removeStorage,
  STORAGE_KEYS,
  setStorageJson,
} from './storage'

// 形式変更時にバンプすると旧 entry は破棄され、通常フェッチで再構築される (#407)
const NOTIFICATION_CACHE_VERSION = 1

interface CacheEnvelope {
  _v: number
  items: NormalizedNotification[]
}

function isValidNotification(v: unknown): v is NormalizedNotification {
  if (typeof v !== 'object' || v === null) return false
  const n = v as Record<string, unknown>
  if (
    typeof n.id !== 'string' ||
    typeof n._accountId !== 'string' ||
    typeof n._serverHost !== 'string' ||
    typeof n.createdAt !== 'string' ||
    typeof n.type !== 'string'
  ) {
    return false
  }
  // grouped 通知の表示パスは配列前提で .filter する (visibleReactions 等)
  if (n.reactions !== undefined && !Array.isArray(n.reactions)) return false
  if (n.users !== undefined && !Array.isArray(n.users)) return false
  return true
}

/**
 * 通知キャッシュを読み込む。バージョン不一致・形式不整合は全破棄して
 * 空配列を返し、通常フェッチに委ねる (#407)。
 */
export function loadNotificationCache(
  accountKey: string,
): NormalizedNotification[] {
  const key = STORAGE_KEYS.notificationCache(accountKey)
  const raw = getStorageJson<unknown>(key, null)
  if (raw === null) return []
  const envelope = raw as Partial<CacheEnvelope>
  if (
    typeof raw === 'object' &&
    !Array.isArray(raw) &&
    envelope._v === NOTIFICATION_CACHE_VERSION &&
    Array.isArray(envelope.items) &&
    envelope.items.every(isValidNotification)
  ) {
    return envelope.items
  }
  removeStorage(key)
  return []
}

/** 通知キャッシュをバージョン付き envelope で保存する。 */
export function saveNotificationCache(
  accountKey: string,
  items: NormalizedNotification[],
): void {
  setStorageJson(STORAGE_KEYS.notificationCache(accountKey), {
    _v: NOTIFICATION_CACHE_VERSION,
    items,
  } satisfies CacheEnvelope)
}
