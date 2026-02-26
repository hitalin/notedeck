import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { NormalizedNote, NormalizedNotification } from '@/adapters/types'

// Capture listen callbacks so we can simulate Tauri events
type ListenCallback = (event: { payload: unknown }) => void
const listenCallbacks = new Map<string, ListenCallback>()
const mockUnlisten = vi.fn()

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}))

vi.mock('@tauri-apps/api/event', () => ({
  listen: vi.fn((eventName: string, callback: ListenCallback) => {
    listenCallbacks.set(eventName, callback)
    return Promise.resolve(mockUnlisten)
  }),
}))

import { invoke } from '@tauri-apps/api/core'
import { MisskeyStream } from '@/adapters/misskey/streaming'

function emitTauriEvent(eventName: string, payload: unknown) {
  const cb = listenCallbacks.get(eventName)
  if (cb) cb({ payload })
}

describe('MisskeyStream', () => {
  let stream: MisskeyStream

  beforeEach(() => {
    stream = new MisskeyStream('acc-1')
    listenCallbacks.clear()
    mockUnlisten.mockClear()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('constructor', () => {
    it('initializes with "initializing" state', () => {
      expect(stream.state).toBe('initializing')
    })
  })

  describe('connect', () => {
    it('invokes stream_connect and sets state to connected', async () => {
      vi.mocked(invoke).mockResolvedValue(undefined)

      stream.connect()
      await vi.waitFor(() => {
        expect(invoke).toHaveBeenCalledWith('stream_connect', {
          accountId: 'acc-1',
        })
      })

      expect(stream.state).toBe('connected')
    })

    it('sets state to disconnected on connect failure', async () => {
      vi.mocked(invoke).mockRejectedValue('connection error')

      stream.connect()
      await vi.waitFor(() => {
        expect(stream.state).toBe('disconnected')
      })
    })

    it('emits connected event to handlers', async () => {
      vi.mocked(invoke).mockResolvedValue(undefined)
      const handler = vi.fn()
      stream.on('connected', handler)

      stream.connect()
      await vi.waitFor(() => {
        expect(handler).toHaveBeenCalled()
      })
    })

    it('updates state from stream-status events', async () => {
      vi.mocked(invoke).mockResolvedValue(undefined)

      stream.connect()
      await vi.waitFor(() => {
        expect(listenCallbacks.has('stream-status')).toBe(true)
      })

      emitTauriEvent('stream-status', {
        accountId: 'acc-1',
        state: 'disconnected',
      })

      expect(stream.state).toBe('disconnected')
    })

    it('ignores stream-status events for other accounts', async () => {
      vi.mocked(invoke).mockResolvedValue(undefined)

      stream.connect()
      await vi.waitFor(() => {
        expect(stream.state).toBe('connected')
      })

      emitTauriEvent('stream-status', {
        accountId: 'acc-other',
        state: 'disconnected',
      })

      expect(stream.state).toBe('connected')
    })
  })

  describe('disconnect', () => {
    it('invokes stream_disconnect and sets state', () => {
      vi.mocked(invoke).mockResolvedValue(undefined)

      stream.disconnect()

      expect(invoke).toHaveBeenCalledWith('stream_disconnect', {
        accountId: 'acc-1',
      })
      expect(stream.state).toBe('disconnected')
    })

    it('calls unlisten for status listener', async () => {
      vi.mocked(invoke).mockResolvedValue(undefined)

      stream.connect()
      await vi.waitFor(() => {
        expect(listenCallbacks.has('stream-status')).toBe(true)
      })

      stream.disconnect()
      expect(mockUnlisten).toHaveBeenCalled()
    })
  })

  describe('subscribeTimeline', () => {
    it('invokes stream_subscribe_timeline and listens for notes', async () => {
      vi.mocked(invoke).mockResolvedValue(undefined)
      stream.connect()
      await vi.waitFor(() => {
        expect(listenCallbacks.has('stream-note')).toBe(true)
      })

      vi.mocked(invoke).mockResolvedValue('sub-123')
      const notes: NormalizedNote[] = []
      stream.subscribeTimeline('home', (note) => notes.push(note))

      await vi.waitFor(() => {
        expect(invoke).toHaveBeenCalledWith('stream_subscribe_timeline', {
          accountId: 'acc-1',
          timelineType: 'home',
        })
      })

      const mockNote: NormalizedNote = {
        id: 'note-1',
        _accountId: 'acc-1',
        _serverHost: 'example.com',
        createdAt: '2025-01-01T00:00:00Z',
        text: 'Hello',
        cw: null,
        user: {
          id: 'u1',
          username: 'test',
          host: null,
          name: 'Test',
          avatarUrl: null,
        },
        visibility: 'public',
        emojis: {},
        reactionEmojis: {},
        reactions: {},
        renoteCount: 0,
        repliesCount: 0,
        files: [],
      }

      emitTauriEvent('stream-note', {
        accountId: 'acc-1',
        subscriptionId: 'sub-123',
        note: mockNote,
      })

      expect(notes).toHaveLength(1)
      expect(notes[0]!.id).toBe('note-1')
    })

    it('filters notes from other accounts', async () => {
      vi.mocked(invoke).mockResolvedValue(undefined)
      stream.connect()
      await vi.waitFor(() => {
        expect(listenCallbacks.has('stream-note')).toBe(true)
      })

      vi.mocked(invoke).mockResolvedValue('sub-123')
      const notes: NormalizedNote[] = []
      stream.subscribeTimeline('home', (note) => notes.push(note))

      await vi.waitFor(() => {
        expect(invoke).toHaveBeenCalledWith(
          'stream_subscribe_timeline',
          expect.any(Object),
        )
      })

      emitTauriEvent('stream-note', {
        accountId: 'acc-other',
        subscriptionId: 'sub-123',
        note: { id: 'note-x' },
      })

      expect(notes).toHaveLength(0)
    })

    it('dispose invokes unsubscribe', async () => {
      vi.mocked(invoke).mockResolvedValue(undefined)
      stream.connect()
      await vi.waitFor(() => {
        expect(listenCallbacks.has('stream-note')).toBe(true)
      })

      vi.mocked(invoke).mockResolvedValue('sub-123')
      const sub = stream.subscribeTimeline('home', () => {})
      await vi.waitFor(() => {
        expect(invoke).toHaveBeenCalledWith(
          'stream_subscribe_timeline',
          expect.any(Object),
        )
      })

      sub.dispose()

      await vi.waitFor(() => {
        expect(invoke).toHaveBeenCalledWith('stream_unsubscribe', {
          accountId: 'acc-1',
          subscriptionId: 'sub-123',
        })
      })
    })
  })

  describe('subscribeMain', () => {
    it('invokes stream_subscribe_main and dispatches notifications', async () => {
      vi.mocked(invoke).mockResolvedValue(undefined)
      stream.connect()
      await vi.waitFor(() => {
        expect(listenCallbacks.has('stream-notification')).toBe(true)
      })

      vi.mocked(invoke).mockResolvedValue('sub-456')
      const events: { type: string; body: unknown }[] = []
      stream.subscribeMain((event) => events.push(event))

      await vi.waitFor(() => {
        expect(invoke).toHaveBeenCalledWith('stream_subscribe_main', {
          accountId: 'acc-1',
        })
      })

      const mockNotification: NormalizedNotification = {
        id: 'notif-1',
        _accountId: 'acc-1',
        _serverHost: 'example.com',
        createdAt: '2025-01-01T00:00:00Z',
        type: 'follow',
        user: {
          id: 'u1',
          username: 'test',
          host: null,
          name: 'Test',
          avatarUrl: null,
        },
      }

      emitTauriEvent('stream-notification', {
        accountId: 'acc-1',
        subscriptionId: 'sub-456',
        notification: mockNotification,
      })

      expect(events).toHaveLength(1)
      expect(events[0]!.type).toBe('notification')
    })

    it('dispatches main channel events', async () => {
      vi.mocked(invoke).mockResolvedValue(undefined)
      stream.connect()
      await vi.waitFor(() => {
        expect(listenCallbacks.has('stream-main-event')).toBe(true)
      })

      vi.mocked(invoke).mockResolvedValue('sub-456')
      const events: { type: string; body: unknown }[] = []
      stream.subscribeMain((event) => events.push(event))

      await vi.waitFor(() => {
        expect(invoke).toHaveBeenCalledWith(
          'stream_subscribe_main',
          expect.any(Object),
        )
      })

      emitTauriEvent('stream-main-event', {
        accountId: 'acc-1',
        subscriptionId: 'sub-456',
        eventType: 'followed',
        body: { userId: 'u2' },
      })

      expect(events).toHaveLength(1)
      expect(events[0]!.type).toBe('followed')
      expect(events[0]!.body).toEqual({ userId: 'u2' })
    })

    it('dispose invokes unsubscribe', async () => {
      vi.mocked(invoke).mockResolvedValue(undefined)
      stream.connect()
      await vi.waitFor(() => {
        expect(listenCallbacks.has('stream-notification')).toBe(true)
      })

      vi.mocked(invoke).mockResolvedValue('sub-456')
      const sub = stream.subscribeMain(() => {})
      await vi.waitFor(() => {
        expect(invoke).toHaveBeenCalledWith(
          'stream_subscribe_main',
          expect.any(Object),
        )
      })

      sub.dispose()

      await vi.waitFor(() => {
        expect(invoke).toHaveBeenCalledWith('stream_unsubscribe', {
          accountId: 'acc-1',
          subscriptionId: 'sub-456',
        })
      })
    })
  })

  describe('on / off', () => {
    it('registers and removes event handlers', () => {
      const handler = vi.fn()
      stream.on('connected', handler)

      // Trigger via internal emit (by connecting)
      vi.mocked(invoke).mockResolvedValue(undefined)
      stream.on('disconnected', handler)

      stream.disconnect()
      expect(handler).toHaveBeenCalledTimes(1) // disconnected

      handler.mockClear()
      stream.off('disconnected', handler)

      stream.disconnect()
      expect(handler).not.toHaveBeenCalled()
    })
  })
})
