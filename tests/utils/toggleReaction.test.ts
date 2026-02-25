import { describe, expect, it, vi } from 'vitest'
import { toggleReaction } from '@/utils/toggleReaction'
import type { NormalizedNote } from '@/adapters/types'

function makeNote(overrides: Partial<NormalizedNote> = {}): NormalizedNote {
  return {
    id: 'note1',
    text: 'hello',
    createdAt: '2025-01-01T00:00:00Z',
    user: {
      id: 'u1',
      username: 'test',
      host: null,
      name: null,
      avatarUrl: null,
    },
    visibility: 'public',
    reactions: {},
    myReaction: null,
    emojis: {},
    reactionEmojis: {},
    files: [],
    renoteCount: 0,
    repliesCount: 0,
    renote: null,
    reply: null,
    cw: null,
    _accountId: 'a1',
    _serverHost: 'example.com',
    ...overrides,
  }
}

function makeApi() {
  return {
    createReaction: vi.fn().mockResolvedValue(undefined),
    deleteReaction: vi.fn().mockResolvedValue(undefined),
  }
}

describe('toggleReaction', () => {
  it('adds a new reaction optimistically', async () => {
    const api = makeApi()
    const note = makeNote()

    await toggleReaction(api, note, '👍')

    expect(note.myReaction).toBe('👍')
    expect(note.reactions['👍']).toBe(1)
    expect(api.createReaction).toHaveBeenCalledWith('note1', '👍')
    expect(api.deleteReaction).not.toHaveBeenCalled()
  })

  it('removes an existing reaction optimistically', async () => {
    const api = makeApi()
    const note = makeNote({
      reactions: { '👍': 1 },
      myReaction: '👍',
    })

    await toggleReaction(api, note, '👍')

    expect(note.myReaction).toBeNull()
    expect(note.reactions['👍']).toBeUndefined()
    expect(api.deleteReaction).toHaveBeenCalledWith('note1')
  })

  it('switches reaction (removes old, adds new)', async () => {
    const api = makeApi()
    const note = makeNote({
      reactions: { '👍': 1 },
      myReaction: '👍',
    })

    await toggleReaction(api, note, '❤️')

    expect(note.myReaction).toBe('❤️')
    expect(note.reactions['👍']).toBeUndefined()
    expect(note.reactions['❤️']).toBe(1)
    expect(api.deleteReaction).toHaveBeenCalledWith('note1')
    expect(api.createReaction).toHaveBeenCalledWith('note1', '❤️')
  })

  it('decrements count instead of deleting when count > 1', async () => {
    const api = makeApi()
    const note = makeNote({
      reactions: { '👍': 3 },
      myReaction: '👍',
    })

    await toggleReaction(api, note, '👍')

    expect(note.myReaction).toBeNull()
    expect(note.reactions['👍']).toBe(2)
  })

  it('rolls back on API failure', async () => {
    const api = makeApi()
    api.createReaction.mockRejectedValue(new Error('fail'))
    const note = makeNote()

    await expect(toggleReaction(api, note, '👍')).rejects.toThrow('fail')

    expect(note.myReaction).toBeNull()
    expect(note.reactions['👍']).toBeUndefined()
  })

  it('rolls back switch on API failure', async () => {
    const api = makeApi()
    api.createReaction.mockRejectedValue(new Error('fail'))
    const note = makeNote({
      reactions: { '👍': 1 },
      myReaction: '👍',
    })

    await expect(toggleReaction(api, note, '❤️')).rejects.toThrow('fail')

    expect(note.myReaction).toBe('👍')
    expect(note.reactions['👍']).toBe(1)
    expect(note.reactions['❤️']).toBeUndefined()
  })
})
