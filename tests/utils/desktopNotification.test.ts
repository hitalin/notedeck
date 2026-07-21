// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { NotificationContext } from '@/utils/desktopNotification'
import {
  initDesktopNotifications,
  onNotificationAction,
  sendDesktopNotification,
} from '@/utils/desktopNotification'

// onAction コールバックをキャプチャし、テストから OS 通知タップを再現する
const captured: { onAction: ((n: unknown) => void) | null } = { onAction: null }

vi.mock('@tauri-apps/plugin-notification', () => ({
  isPermissionGranted: vi.fn(async () => true),
  requestPermission: vi.fn(async () => 'granted'),
  onAction: vi.fn(async (cb: (n: unknown) => void) => {
    captured.onAction = cb
  }),
  sendNotification: vi.fn(),
}))

describe('desktopNotification onAction', () => {
  const received: NotificationContext[] = []

  beforeEach(async () => {
    received.length = 0
    await initDesktopNotifications()
    onNotificationAction((ctx) => received.push(ctx))
  })

  it('Rust 経路 (Android) の extra からコンテキストを復元して遷移する (#754)', () => {
    captured.onAction?.({
      id: 999,
      extra: { accountId: 'acct-1', noteId: 'note-1', userId: 'u1' },
    })
    expect(received).toEqual([
      { accountId: 'acct-1', noteId: 'note-1', userId: 'u1' },
    ])
  })

  it('extra に accountId が無い通知タップでは遷移しない', () => {
    captured.onAction?.({ id: 999, extra: { noteId: 'note-1' } })
    captured.onAction?.({ id: 999 })
    expect(received).toEqual([])
  })

  it('JS 経路 (sendDesktopNotification) の pendingContext が extra より優先される', () => {
    // document.hasFocus() が true だと送信抑制されるため false を再現
    vi.spyOn(document, 'hasFocus').mockReturnValue(false)
    sendDesktopNotification('title', 'body', {
      accountId: 'acct-js',
      noteId: 'note-js',
    })
    // sendDesktopNotification は id=1 から採番する
    captured.onAction?.({
      id: 1,
      extra: { accountId: 'acct-rust', noteId: 'note-rust' },
    })
    expect(received).toEqual([{ accountId: 'acct-js', noteId: 'note-js' }])
  })
})
