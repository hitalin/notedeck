import { beforeEach, describe, expect, it } from 'vitest'
import type { NormalizedNotification } from '@/adapters/types'
import {
  CROSS_ACCOUNT_NOTIFICATION_KEY,
  loadNotificationCache,
  purgeNotificationCacheForAccount,
  saveNotificationCache,
} from './notificationCache'

function notification(id: string, accountId: string): NormalizedNotification {
  return {
    id,
    _accountId: accountId,
    _serverHost: 'example.com',
    createdAt: '2026-07-01T00:00:00.000Z',
    type: 'reaction',
  } as unknown as NormalizedNotification
}

describe('purgeNotificationCacheForAccount: アカウント削除で通知キャッシュも消す', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('per-account キャッシュを削除する', () => {
    saveNotificationCache('acc-1', [notification('n1', 'acc-1')])
    purgeNotificationCacheForAccount('acc-1')
    expect(loadNotificationCache('acc-1')).toEqual([])
  })

  it('cross-account キャッシュから該当アカウント由来の entry だけ除去する', () => {
    saveNotificationCache(CROSS_ACCOUNT_NOTIFICATION_KEY, [
      notification('n1', 'acc-1'),
      notification('n2', 'acc-2'),
    ])
    purgeNotificationCacheForAccount('acc-1')
    const remaining = loadNotificationCache(CROSS_ACCOUNT_NOTIFICATION_KEY)
    expect(remaining.map((n) => n.id)).toEqual(['n2'])
  })

  it('cross-account キャッシュが空になったらキーごと削除する', () => {
    saveNotificationCache(CROSS_ACCOUNT_NOTIFICATION_KEY, [
      notification('n1', 'acc-1'),
    ])
    purgeNotificationCacheForAccount('acc-1')
    expect(loadNotificationCache(CROSS_ACCOUNT_NOTIFICATION_KEY)).toEqual([])
    expect(
      localStorage.getItem('nd-cache-notifications-cross-account'),
    ).toBeNull()
  })

  it('他アカウントのキャッシュには影響しない', () => {
    saveNotificationCache('acc-2', [notification('n2', 'acc-2')])
    purgeNotificationCacheForAccount('acc-1')
    expect(loadNotificationCache('acc-2').map((n) => n.id)).toEqual(['n2'])
  })
})
