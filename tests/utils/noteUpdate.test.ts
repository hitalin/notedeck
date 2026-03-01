import { describe, expect, it } from 'vitest'
import type { NormalizedNote, NoteUpdateEvent } from '@/adapters/types'
import { applyNoteUpdate } from '@/utils/noteUpdate'

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

describe('applyNoteUpdate', () => {
  describe('reacted', () => {
    it('increments reaction count for matching note', () => {
      const notes = [makeNote({ reactions: { '👍': 2 } })]
      const event: NoteUpdateEvent = {
        noteId: 'note1',
        type: 'reacted',
        body: { reaction: '👍', userId: 'other-user' },
      }

      const result = applyNoteUpdate(notes, event, 'my-user')

      expect(result[0].reactions['👍']).toBe(3)
    })

    it('adds new reaction key if not present', () => {
      const notes = [makeNote()]
      const event: NoteUpdateEvent = {
        noteId: 'note1',
        type: 'reacted',
        body: { reaction: '❤️', userId: 'other-user' },
      }

      const result = applyNoteUpdate(notes, event, 'my-user')

      expect(result[0].reactions['❤️']).toBe(1)
    })

    it('skips if reaction is from own user', () => {
      const notes = [makeNote()]
      const event: NoteUpdateEvent = {
        noteId: 'note1',
        type: 'reacted',
        body: { reaction: '👍', userId: 'my-user' },
      }

      const result = applyNoteUpdate(notes, event, 'my-user')

      expect(result[0].reactions['👍']).toBeUndefined()
    })

    it('updates renote target when renoteId matches', () => {
      const renote = makeNote({ id: 'target', reactions: { '👍': 1 } })
      const notes = [makeNote({ id: 'wrapper', renoteId: 'target', renote })]
      const event: NoteUpdateEvent = {
        noteId: 'target',
        type: 'reacted',
        body: { reaction: '👍', userId: 'other-user' },
      }

      const result = applyNoteUpdate(notes, event, 'my-user')

      expect(result[0].renote!.reactions['👍']).toBe(2)
      expect(result[0].reactions['👍']).toBeUndefined()
    })

    it('stores custom emoji URL in reactionEmojis', () => {
      const notes = [makeNote()]
      const event: NoteUpdateEvent = {
        noteId: 'note1',
        type: 'reacted',
        body: {
          reaction: ':custom:',
          userId: 'other-user',
          emoji: 'https://example.com/emoji.png',
        },
      }

      const result = applyNoteUpdate(notes, event, 'my-user')

      expect(result[0].reactionEmojis[':custom:']).toBe(
        'https://example.com/emoji.png',
      )
    })

    it('does nothing if reaction is missing', () => {
      const notes = [makeNote()]
      const event: NoteUpdateEvent = {
        noteId: 'note1',
        type: 'reacted',
        body: { userId: 'other-user' },
      }

      const result = applyNoteUpdate(notes, event, 'my-user')

      expect(result).toEqual(notes)
    })

    it('does not mutate original notes array', () => {
      const notes = [makeNote({ reactions: { '👍': 1 } })]
      const event: NoteUpdateEvent = {
        noteId: 'note1',
        type: 'reacted',
        body: { reaction: '👍', userId: 'other-user' },
      }

      const result = applyNoteUpdate(notes, event, 'my-user')

      expect(result).not.toBe(notes)
      expect(notes[0].reactions['👍']).toBe(1)
    })
  })

  describe('unreacted', () => {
    it('decrements reaction count', () => {
      const notes = [makeNote({ reactions: { '👍': 3 } })]
      const event: NoteUpdateEvent = {
        noteId: 'note1',
        type: 'unreacted',
        body: { reaction: '👍', userId: 'other-user' },
      }

      const result = applyNoteUpdate(notes, event, 'my-user')

      expect(result[0].reactions['👍']).toBe(2)
    })

    it('removes reaction key when count reaches 0', () => {
      const notes = [makeNote({ reactions: { '👍': 1 } })]
      const event: NoteUpdateEvent = {
        noteId: 'note1',
        type: 'unreacted',
        body: { reaction: '👍', userId: 'other-user' },
      }

      const result = applyNoteUpdate(notes, event, 'my-user')

      expect(result[0].reactions['👍']).toBeUndefined()
    })

    it('skips if reaction is from own user', () => {
      const notes = [makeNote({ reactions: { '👍': 2 } })]
      const event: NoteUpdateEvent = {
        noteId: 'note1',
        type: 'unreacted',
        body: { reaction: '👍', userId: 'my-user' },
      }

      const result = applyNoteUpdate(notes, event, 'my-user')

      expect(result[0].reactions['👍']).toBe(2)
    })

    it('updates renote target when renoteId matches', () => {
      const renote = makeNote({ id: 'target', reactions: { '👍': 2 } })
      const notes = [makeNote({ id: 'wrapper', renoteId: 'target', renote })]
      const event: NoteUpdateEvent = {
        noteId: 'target',
        type: 'unreacted',
        body: { reaction: '👍', userId: 'other-user' },
      }

      const result = applyNoteUpdate(notes, event, 'my-user')

      expect(result[0].renote!.reactions['👍']).toBe(1)
    })
  })

  describe('deleted', () => {
    it('removes note with matching id', () => {
      const notes = [makeNote({ id: 'n1' }), makeNote({ id: 'n2' })]
      const event: NoteUpdateEvent = {
        noteId: 'n1',
        type: 'deleted',
        body: { deletedAt: '2025-01-01T00:00:00Z' },
      }

      const result = applyNoteUpdate(notes, event, 'my-user')

      expect(result).toHaveLength(1)
      expect(result[0].id).toBe('n2')
    })

    it('removes note whose renoteId matches', () => {
      const notes = [
        makeNote({ id: 'wrapper', renoteId: 'target' }),
        makeNote({ id: 'n2' }),
      ]
      const event: NoteUpdateEvent = {
        noteId: 'target',
        type: 'deleted',
        body: { deletedAt: '2025-01-01T00:00:00Z' },
      }

      const result = applyNoteUpdate(notes, event, 'my-user')

      expect(result).toHaveLength(1)
      expect(result[0].id).toBe('n2')
    })

    it('returns deletedIds including removed notes', () => {
      const notes = [makeNote({ id: 'n1' })]
      const event: NoteUpdateEvent = {
        noteId: 'n1',
        type: 'deleted',
        body: { deletedAt: '2025-01-01T00:00:00Z' },
      }

      const result = applyNoteUpdate(notes, event, 'my-user')

      expect(result).toHaveLength(0)
    })
  })

  describe('pollVoted', () => {
    it('increments vote count for the chosen option', () => {
      const notes = [
        makeNote({
          poll: {
            choices: [
              { text: 'A', votes: 0, isVoted: false },
              { text: 'B', votes: 5, isVoted: false },
            ],
            multiple: false,
            expiresAt: null,
          },
        }),
      ]
      const event: NoteUpdateEvent = {
        noteId: 'note1',
        type: 'pollVoted',
        body: { choice: 1, userId: 'other-user' },
      }

      const result = applyNoteUpdate(notes, event, 'my-user')

      expect(result[0].poll!.choices[0].votes).toBe(0)
      expect(result[0].poll!.choices[1].votes).toBe(6)
    })

    it('does nothing if note has no poll', () => {
      const notes = [makeNote()]
      const event: NoteUpdateEvent = {
        noteId: 'note1',
        type: 'pollVoted',
        body: { choice: 0, userId: 'other-user' },
      }

      const result = applyNoteUpdate(notes, event, 'my-user')

      expect(result).toEqual(notes)
    })

    it('updates renote target poll', () => {
      const renote = makeNote({
        id: 'target',
        poll: {
          choices: [{ text: 'A', votes: 3, isVoted: false }],
          multiple: false,
          expiresAt: null,
        },
      })
      const notes = [makeNote({ id: 'wrapper', renoteId: 'target', renote })]
      const event: NoteUpdateEvent = {
        noteId: 'target',
        type: 'pollVoted',
        body: { choice: 0, userId: 'other-user' },
      }

      const result = applyNoteUpdate(notes, event, 'my-user')

      expect(result[0].renote!.poll!.choices[0].votes).toBe(4)
    })
  })

  it('returns same array reference if noteId does not match', () => {
    const notes = [makeNote()]
    const event: NoteUpdateEvent = {
      noteId: 'non-existent',
      type: 'reacted',
      body: { reaction: '👍', userId: 'other-user' },
    }

    const result = applyNoteUpdate(notes, event, 'my-user')

    expect(result).toBe(notes)
  })
})
