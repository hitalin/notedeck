// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from 'vitest'
import type { NormalizedNotification } from '@/adapters/types'
import {
  loadNotificationCache,
  saveNotificationCache,
} from '@/utils/notificationCache'
import { STORAGE_KEYS } from '@/utils/storage'

const ACCOUNT_KEY = 'test-account'
const KEY = STORAGE_KEYS.notificationCache(ACCOUNT_KEY)

function makeNotification(
  overrides: Partial<NormalizedNotification> = {},
): NormalizedNotification {
  return {
    id: 'n1',
    _accountId: 'test-account',
    _serverHost: 'misskey.example.com',
    createdAt: '2026-06-11T00:00:00.000Z',
    type: 'reaction',
    ...overrides,
  }
}

describe('notificationCache', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('save した通知一覧を load すると同じ配列が返る (optional フィールドも保持)', () => {
    const items = [
      makeNotification(),
      makeNotification({
        id: 'n2',
        type: 'reaction:grouped',
        reactions: [],
        reaction: '👍',
      }),
    ]
    saveNotificationCache(ACCOUNT_KEY, items)
    expect(loadNotificationCache(ACCOUNT_KEY)).toEqual(items)
  })

  it('旧形式の plain array は破棄され、キーも削除される', () => {
    localStorage.setItem(KEY, JSON.stringify([makeNotification()]))
    expect(loadNotificationCache(ACCOUNT_KEY)).toEqual([])
    expect(localStorage.getItem(KEY)).toBeNull()
  })

  it('version が不一致の envelope は破棄される', () => {
    localStorage.setItem(
      KEY,
      JSON.stringify({ _v: 999, items: [makeNotification()] }),
    )
    expect(loadNotificationCache(ACCOUNT_KEY)).toEqual([])
    expect(localStorage.getItem(KEY)).toBeNull()
  })

  it('必須フィールド欠落 item が 1 件でも混入していると全破棄される', () => {
    localStorage.setItem(
      KEY,
      JSON.stringify({ _v: 1, items: [makeNotification(), { id: 'x' }] }),
    )
    expect(loadNotificationCache(ACCOUNT_KEY)).toEqual([])
    expect(localStorage.getItem(KEY)).toBeNull()
  })

  it('必須フィールドが string 以外の item が混入していると全破棄される', () => {
    localStorage.setItem(
      KEY,
      JSON.stringify({
        _v: 1,
        items: [makeNotification({ createdAt: 123 as unknown as string })],
      }),
    )
    expect(loadNotificationCache(ACCOUNT_KEY)).toEqual([])
  })

  it('reactions が配列でない item が混入していると全破棄される', () => {
    localStorage.setItem(
      KEY,
      JSON.stringify({
        _v: 1,
        items: [makeNotification({ reactions: {} as unknown as [] })],
      }),
    )
    expect(loadNotificationCache(ACCOUNT_KEY)).toEqual([])
  })

  it('users が配列でない item が混入していると全破棄される', () => {
    localStorage.setItem(
      KEY,
      JSON.stringify({
        _v: 1,
        items: [makeNotification({ users: 'broken' as unknown as [] })],
      }),
    )
    expect(loadNotificationCache(ACCOUNT_KEY)).toEqual([])
  })

  it('JSON として壊れたデータは空配列にフォールバックする', () => {
    localStorage.setItem(KEY, '{broken')
    expect(loadNotificationCache(ACCOUNT_KEY)).toEqual([])
  })

  it('キーが存在しないとき load は空配列を返す', () => {
    expect(loadNotificationCache(ACCOUNT_KEY)).toEqual([])
  })

  it('item が null のとき全破棄される', () => {
    localStorage.setItem(KEY, JSON.stringify({ _v: 1, items: [null] }))
    expect(loadNotificationCache(ACCOUNT_KEY)).toEqual([])
  })
})
