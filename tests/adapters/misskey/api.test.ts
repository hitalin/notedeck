import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}))

import { invoke } from '@tauri-apps/api/core'
import { MisskeyApi } from '@/adapters/misskey/api'

describe('MisskeyApi', () => {
  let api: MisskeyApi

  beforeEach(() => {
    api = new MisskeyApi('acc-1')
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('getNote', () => {
    it('invokes api_get_note and returns the result', async () => {
      const mockNote = {
        id: 'note-1',
        _accountId: 'acc-1',
        _serverHost: 'example.com',
        createdAt: '2025-01-01T00:00:00Z',
        text: 'Hello world',
        cw: null,
        user: {
          id: 'user-1',
          username: 'test',
          host: null,
          name: 'Test',
          avatarUrl: null,
        },
        visibility: 'public',
        emojis: {},
        reactionEmojis: {},
        reactions: { '👍': 3 },
        myReaction: '👍',
        renoteCount: 1,
        repliesCount: 2,
        files: [],
      }

      vi.mocked(invoke).mockResolvedValue(mockNote)

      const note = await api.getNote('note-1')

      expect(note.id).toBe('note-1')
      expect(note.text).toBe('Hello world')
      expect(note._accountId).toBe('acc-1')
      expect(note._serverHost).toBe('example.com')

      expect(invoke).toHaveBeenCalledWith('api_get_note', {
        accountId: 'acc-1',
        noteId: 'note-1',
      })
    })
  })

  describe('createReaction', () => {
    it('invokes api_create_reaction', async () => {
      vi.mocked(invoke).mockResolvedValue(undefined)

      await api.createReaction('note-1', '👍')

      expect(invoke).toHaveBeenCalledWith('api_create_reaction', {
        accountId: 'acc-1',
        noteId: 'note-1',
        reaction: '👍',
      })
    })
  })

  describe('deleteReaction', () => {
    it('invokes api_delete_reaction', async () => {
      vi.mocked(invoke).mockResolvedValue(undefined)

      await api.deleteReaction('note-1')

      expect(invoke).toHaveBeenCalledWith('api_delete_reaction', {
        accountId: 'acc-1',
        noteId: 'note-1',
      })
    })
  })

  describe('getTimeline', () => {
    it('invokes api_get_timeline with options', async () => {
      vi.mocked(invoke).mockResolvedValue([])

      await api.getTimeline('home', { limit: 10 })

      expect(invoke).toHaveBeenCalledWith('api_get_timeline', {
        accountId: 'acc-1',
        timelineType: 'home',
        options: { limit: 10, sinceId: null, untilId: null },
      })
    })
  })

  describe('getUserNotes', () => {
    it('invokes api_get_user_notes with options', async () => {
      vi.mocked(invoke).mockResolvedValue([])

      await api.getUserNotes('user-1', { limit: 20, untilId: 'last-1' })

      expect(invoke).toHaveBeenCalledWith('api_get_user_notes', {
        accountId: 'acc-1',
        userId: 'user-1',
        options: { limit: 20, sinceId: null, untilId: 'last-1' },
      })
    })
  })

  describe('error handling', () => {
    it('propagates invoke errors', async () => {
      vi.mocked(invoke).mockRejectedValue('notes/show (404)')

      await expect(api.getNote('bad-id')).rejects.toBe('notes/show (404)')
    })
  })
})
