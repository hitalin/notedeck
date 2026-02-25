import { describe, expect, it } from 'vitest'
import { parseMfm, type MfmToken } from '@/utils/mfm'

describe('parseMfm', () => {
  it('returns empty array for empty string', () => {
    expect(parseMfm('')).toEqual([])
  })

  it('returns single text token for plain text', () => {
    const tokens = parseMfm('hello world')
    expect(tokens).toEqual([{ type: 'text', value: 'hello world' }])
  })

  // URL
  it('parses URLs', () => {
    const tokens = parseMfm('visit https://example.com today')
    expect(tokens).toHaveLength(3)
    expect(tokens[0]).toEqual({ type: 'text', value: 'visit ' })
    expect(tokens[1]).toEqual({ type: 'url', value: 'https://example.com' })
    expect(tokens[2]).toEqual({ type: 'text', value: ' today' })
  })

  it('parses URL with path and query', () => {
    const tokens = parseMfm('https://example.com/path?q=1&b=2#hash')
    expect(tokens).toHaveLength(1)
    expect(tokens[0]!.type).toBe('url')
  })

  // Mentions
  it('parses local mention', () => {
    const tokens = parseMfm('hello @user')
    expect(tokens).toHaveLength(2)
    expect(tokens[0]).toEqual({ type: 'text', value: 'hello ' })
    expect(tokens[1]).toEqual({
      type: 'mention',
      username: 'user',
      host: null,
      acct: '@user',
    })
  })

  it('parses remote mention', () => {
    const tokens = parseMfm('@user@example.com hi')
    expect(tokens).toHaveLength(2)
    expect(tokens[0]).toEqual({
      type: 'mention',
      username: 'user',
      host: 'example.com',
      acct: '@user@example.com',
    })
    expect(tokens[1]).toEqual({ type: 'text', value: ' hi' })
  })

  it('does not parse mention inside word', () => {
    const tokens = parseMfm('email@example.com')
    expect(tokens).toHaveLength(1)
    expect(tokens[0]!.type).toBe('text')
  })

  // Hashtags
  it('parses hashtag', () => {
    const tokens = parseMfm('check #Misskey')
    expect(tokens).toHaveLength(2)
    expect(tokens[0]).toEqual({ type: 'text', value: 'check ' })
    expect(tokens[1]).toEqual({ type: 'hashtag', value: 'Misskey' })
  })

  it('parses Japanese hashtag', () => {
    const tokens = parseMfm('#日本語タグ test')
    expect(tokens).toHaveLength(2)
    expect(tokens[0]).toEqual({ type: 'hashtag', value: '日本語タグ' })
    expect(tokens[1]).toEqual({ type: 'text', value: ' test' })
  })

  // Bold
  it('parses bold', () => {
    const tokens = parseMfm('this is **bold** text')
    expect(tokens).toHaveLength(3)
    expect(tokens[1]).toEqual({ type: 'bold', value: 'bold' })
  })

  // Italic
  it('parses italic', () => {
    const tokens = parseMfm('this is *italic* text')
    expect(tokens).toHaveLength(3)
    expect(tokens[1]).toEqual({ type: 'italic', value: 'italic' })
  })

  it('does not confuse bold with italic', () => {
    const tokens = parseMfm('**bold** and *italic*')
    const bold = tokens.find((t): t is MfmToken & { type: 'bold' } => t.type === 'bold')
    const italic = tokens.find((t): t is MfmToken & { type: 'italic' } => t.type === 'italic')
    expect(bold?.value).toBe('bold')
    expect(italic?.value).toBe('italic')
  })

  // Strikethrough
  it('parses strikethrough', () => {
    const tokens = parseMfm('this is ~~deleted~~ text')
    expect(tokens).toHaveLength(3)
    expect(tokens[1]).toEqual({ type: 'strike', value: 'deleted' })
  })

  // Inline code
  it('parses inline code', () => {
    const tokens = parseMfm('use `console.log()` here')
    expect(tokens).toHaveLength(3)
    expect(tokens[1]).toEqual({ type: 'inlineCode', value: 'console.log()' })
  })

  it('inline code takes priority over other patterns', () => {
    const tokens = parseMfm('`**not bold**`')
    expect(tokens).toHaveLength(1)
    expect(tokens[0]).toEqual({ type: 'inlineCode', value: '**not bold**' })
  })

  // Custom emoji
  it('parses custom emoji', () => {
    const tokens = parseMfm('hello :blobcat: world')
    expect(tokens).toHaveLength(3)
    expect(tokens[1]).toEqual({ type: 'customEmoji', shortcode: 'blobcat' })
  })

  it('parses remote custom emoji', () => {
    const tokens = parseMfm(':emoji@remote.host:')
    expect(tokens).toHaveLength(1)
    expect(tokens[0]).toEqual({ type: 'customEmoji', shortcode: 'emoji@remote.host' })
  })

  // Unicode emoji
  it('parses unicode emoji', () => {
    const tokens = parseMfm('hello 😀 world')
    expect(tokens).toHaveLength(3)
    expect(tokens[0]).toEqual({ type: 'text', value: 'hello ' })
    expect(tokens[1]!.type).toBe('unicodeEmoji')
    expect((tokens[1] as { type: 'unicodeEmoji'; value: string }).value).toBe('😀')
    expect(tokens[2]).toEqual({ type: 'text', value: ' world' })
  })

  // Mixed
  it('parses mixed content', () => {
    const tokens = parseMfm('**bold** @user https://example.com :emoji: #tag')
    const types = tokens.map((t) => t.type)
    expect(types).toContain('bold')
    expect(types).toContain('mention')
    expect(types).toContain('url')
    expect(types).toContain('customEmoji')
    expect(types).toContain('hashtag')
  })

  // URL takes priority over patterns inside it
  it('URL is not broken by custom emoji-like patterns', () => {
    const tokens = parseMfm('https://example.com/path')
    expect(tokens).toHaveLength(1)
    expect(tokens[0]!.type).toBe('url')
  })
})
