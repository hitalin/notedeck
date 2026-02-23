import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'
import type { NormalizedNote } from '@/adapters/types'
import { useTimelinesStore } from '@/stores/timelines'

function createTestNote(
  overrides: Partial<NormalizedNote> = {},
): NormalizedNote {
  return {
    id: 'note-1',
    _accountId: 'acc-1',
    _serverHost: 'example.com',
    createdAt: '2025-01-01T00:00:00Z',
    text: 'Hello',
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
    reactions: {},
    renoteCount: 0,
    repliesCount: 0,
    files: [],
    ...overrides,
  }
}

describe('timelines store', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('initializes a timeline', () => {
    const store = useTimelinesStore()
    store.initTimeline('acc-1', 'home')

    const tl = store.perServer.get('acc-1')
    expect(tl).toBeDefined()
    expect(tl?.notes).toHaveLength(0)
    expect(tl?.type).toBe('home')
  })

  it('pushes notes to the front', () => {
    const store = useTimelinesStore()
    store.initTimeline('acc-1', 'home')
    store.setNotes('acc-1', [createTestNote({ id: 'n1' })])
    store.pushNote('acc-1', createTestNote({ id: 'n2' }))

    const tl = store.perServer.get('acc-1')
    expect(tl?.notes[0].id).toBe('n2')
    expect(tl?.notes[1].id).toBe('n1')
  })

  it('merges notes from multiple servers in unified', () => {
    const store = useTimelinesStore()
    store.initTimeline('acc-1', 'home')
    store.initTimeline('acc-2', 'home')

    store.setNotes('acc-1', [
      createTestNote({
        id: 'a1',
        _accountId: 'acc-1',
        createdAt: '2025-01-01T00:01:00Z',
      }),
    ])
    store.setNotes('acc-2', [
      createTestNote({
        id: 'b1',
        _accountId: 'acc-2',
        createdAt: '2025-01-01T00:02:00Z',
      }),
    ])

    expect(store.unified).toHaveLength(2)
    expect(store.unified[0].id).toBe('b1')
    expect(store.unified[1].id).toBe('a1')
  })

  it('clears a specific timeline', () => {
    const store = useTimelinesStore()
    store.initTimeline('acc-1', 'home')
    store.setNotes('acc-1', [createTestNote()])
    store.clear('acc-1')

    expect(store.perServer.has('acc-1')).toBe(false)
  })
})
