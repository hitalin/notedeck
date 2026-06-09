import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'
import { useWordMuteStore } from '@/stores/wordMutes'

describe('useWordMuteStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('matches hard and soft words after sync', () => {
    const store = useWordMuteStore()
    store.setWords('acc1', [['spoiler']], [['banned']])
    expect(store.matchesSoft('acc1', 'a spoiler appears')).toBe(true)
    expect(store.matchesHard('acc1', 'a spoiler appears')).toBe(false)
    expect(store.matchesHard('acc1', 'banned content')).toBe(true)
  })

  it('is scoped per account', () => {
    const store = useWordMuteStore()
    store.setWords('acc1', [['x']], [])
    expect(store.matchesSoft('acc2', 'x here')).toBe(false)
  })

  it('replaces words on re-sync and reflects removal', () => {
    const store = useWordMuteStore()
    store.setWords('acc1', [['old']], [])
    expect(store.matchesSoft('acc1', 'old word')).toBe(true)
    store.setWords('acc1', [['new']], [])
    expect(store.matchesSoft('acc1', 'old word')).toBe(false)
    expect(store.matchesSoft('acc1', 'new word')).toBe(true)
  })

  it('returns false when account has no words or is missing', () => {
    const store = useWordMuteStore()
    expect(store.matchesSoft('acc1', 'anything')).toBe(false)
    expect(store.matchesHard(null, 'anything')).toBe(false)
  })
})
