import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'
import { useEmojisStore } from '@/stores/emojis'

describe('emojis store', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('set and resolve an emoji', () => {
    const store = useEmojisStore()
    store.set('example.com', { smile: 'https://example.com/smile.png' })

    expect(store.resolve('example.com', 'smile')).toBe(
      'https://example.com/smile.png',
    )
  })

  it('returns null for unknown host', () => {
    const store = useEmojisStore()
    expect(store.resolve('unknown.com', 'smile')).toBeNull()
  })

  it('returns null for unknown shortcode', () => {
    const store = useEmojisStore()
    store.set('example.com', { smile: 'https://example.com/smile.png' })

    expect(store.resolve('example.com', 'cry')).toBeNull()
  })

  it('resolves shortcode with @. suffix stripped', () => {
    const store = useEmojisStore()
    store.set('example.com', { smile: 'https://example.com/smile.png' })

    expect(store.resolve('example.com', 'smile@.')).toBe(
      'https://example.com/smile.png',
    )
  })

  it('has returns true for cached host', () => {
    const store = useEmojisStore()
    store.set('example.com', {})

    expect(store.has('example.com')).toBe(true)
    expect(store.has('other.com')).toBe(false)
  })

  it('overwrites emojis for the same host', () => {
    const store = useEmojisStore()
    store.set('example.com', { a: 'url-a' })
    store.set('example.com', { b: 'url-b' })

    expect(store.resolve('example.com', 'a')).toBeNull()
    expect(store.resolve('example.com', 'b')).toBe('url-b')
  })

  it('supports multiple hosts independently', () => {
    const store = useEmojisStore()
    store.set('host1.com', { emoji1: 'url1' })
    store.set('host2.com', { emoji2: 'url2' })

    expect(store.resolve('host1.com', 'emoji1')).toBe('url1')
    expect(store.resolve('host1.com', 'emoji2')).toBeNull()
    expect(store.resolve('host2.com', 'emoji2')).toBe('url2')
    expect(store.resolve('host2.com', 'emoji1')).toBeNull()
  })
})
