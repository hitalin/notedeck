import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'
import { useEmojiResolver } from '@/composables/useEmojiResolver'
import { useEmojisStore } from '@/stores/emojis'

describe('useEmojiResolver', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  describe('resolveEmoji', () => {
    it('resolves from note-level emojis first', () => {
      const { resolveEmoji } = useEmojiResolver()
      const emojis = { smile: 'https://note-level/smile.png' }
      expect(resolveEmoji('smile', emojis, {}, 'example.com')).toBe(
        'https://note-level/smile.png',
      )
    })

    it('resolves from reactionEmojis when not in emojis', () => {
      const { resolveEmoji } = useEmojiResolver()
      const reactionEmojis = { heart: 'https://reaction/heart.png' }
      expect(resolveEmoji('heart', {}, reactionEmojis, 'example.com')).toBe(
        'https://reaction/heart.png',
      )
    })

    it('falls back to server cache via emojisStore', () => {
      const store = useEmojisStore()
      store.set('example.com', { star: 'https://server/star.png' })

      const { resolveEmoji } = useEmojiResolver()
      expect(resolveEmoji('star', {}, {}, 'example.com')).toBe(
        'https://server/star.png',
      )
    })

    it('strips @. suffix before resolving', () => {
      const { resolveEmoji } = useEmojiResolver()
      const emojis = { smile: 'https://example.com/smile.png' }
      expect(resolveEmoji('smile@.', emojis, {}, 'example.com')).toBe(
        'https://example.com/smile.png',
      )
    })

    it('returns null when emoji not found anywhere', () => {
      const { resolveEmoji } = useEmojiResolver()
      expect(resolveEmoji('unknown', {}, {}, 'example.com')).toBeNull()
    })

    it('prefers emojis over reactionEmojis', () => {
      const { resolveEmoji } = useEmojiResolver()
      const emojis = { test: 'https://emojis/test.png' }
      const reactionEmojis = { test: 'https://reaction/test.png' }
      expect(resolveEmoji('test', emojis, reactionEmojis, 'example.com')).toBe(
        'https://emojis/test.png',
      )
    })
  })

  describe('reactionUrl', () => {
    it('resolves custom emoji reaction (colon-wrapped)', () => {
      const { reactionUrl } = useEmojiResolver()
      const emojis = { heart: 'https://example.com/heart.png' }
      expect(reactionUrl(':heart:', emojis, {}, 'example.com')).toBe(
        'https://example.com/heart.png',
      )
    })

    it('returns null for unicode emoji reaction', () => {
      const { reactionUrl } = useEmojiResolver()
      expect(reactionUrl('👍', {}, {}, 'example.com')).toBeNull()
    })

    it('returns null for unknown custom emoji', () => {
      const { reactionUrl } = useEmojiResolver()
      expect(reactionUrl(':unknown:', {}, {}, 'example.com')).toBeNull()
    })

    it('does not treat single colon as custom emoji', () => {
      const { reactionUrl } = useEmojiResolver()
      expect(reactionUrl(':', {}, {}, 'example.com')).toBeNull()
    })
  })
})
