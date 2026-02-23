import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MisskeyApi } from '@/adapters/misskey/api'

describe('MisskeyApi', () => {
  let api: MisskeyApi

  beforeEach(() => {
    api = new MisskeyApi('example.com', 'test-token', 'acc-1')
    vi.stubGlobal(
      'fetch',
      vi.fn<
        (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
      >(),
    )
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('getNote', () => {
    it('fetches and normalizes a note', async () => {
      const rawNote = {
        id: 'note-1',
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
        reactions: { '👍': 3 },
        myReaction: '👍',
        renoteCount: 1,
        repliesCount: 2,
        files: [],
      }

      vi.mocked(fetch).mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(rawNote),
      } as Response)

      const note = await api.getNote('note-1')

      expect(note.id).toBe('note-1')
      expect(note.text).toBe('Hello world')
      expect(note._accountId).toBe('acc-1')
      expect(note._serverHost).toBe('example.com')

      expect(fetch).toHaveBeenCalledWith('https://example.com/api/notes/show', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ noteId: 'note-1', i: 'test-token' }),
      })
    })
  })

  describe('createReaction', () => {
    it('sends reaction to the API', async () => {
      vi.mocked(fetch).mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({}),
      } as Response)

      await api.createReaction('note-1', '👍')

      expect(fetch).toHaveBeenCalledWith(
        'https://example.com/api/notes/reactions/create',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            noteId: 'note-1',
            reaction: '👍',
            i: 'test-token',
          }),
        },
      )
    })
  })

  describe('deleteReaction', () => {
    it('removes reaction via the API', async () => {
      vi.mocked(fetch).mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({}),
      } as Response)

      await api.deleteReaction('note-1')

      expect(fetch).toHaveBeenCalledWith(
        'https://example.com/api/notes/reactions/delete',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ noteId: 'note-1', i: 'test-token' }),
        },
      )
    })
  })

  describe('request error handling', () => {
    it('throws with status code when no error body', async () => {
      vi.mocked(fetch).mockResolvedValue({
        ok: false,
        status: 404,
        json: () => Promise.reject(new Error('no json')),
      } as unknown as Response)

      await expect(api.getNote('bad-id')).rejects.toThrow('notes/show (404)')
    })

    it('throws with error message from response body', async () => {
      vi.mocked(fetch).mockResolvedValue({
        ok: false,
        status: 400,
        json: () =>
          Promise.resolve({
            error: {
              message: 'TIMELINE_DISABLED',
              code: 'TIMELINE_DISABLED',
            },
          }),
      } as unknown as Response)

      await expect(api.getNote('bad-id')).rejects.toThrow(
        'notes/show: TIMELINE_DISABLED',
      )
    })
  })
})
