import { describe, expect, it } from 'vitest'
import { type MfmToken, parseMfm } from '@/utils/mfm'

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
    const bold = tokens.find(
      (t): t is MfmToken & { type: 'bold' } => t.type === 'bold',
    )
    const italic = tokens.find(
      (t): t is MfmToken & { type: 'italic' } => t.type === 'italic',
    )
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
    expect(tokens[0]).toEqual({
      type: 'customEmoji',
      shortcode: 'emoji@remote.host',
    })
  })

  // Unicode emoji
  it('parses unicode emoji', () => {
    const tokens = parseMfm('hello 😀 world')
    expect(tokens).toHaveLength(3)
    expect(tokens[0]).toEqual({ type: 'text', value: 'hello ' })
    expect(tokens[1]!.type).toBe('unicodeEmoji')
    expect((tokens[1] as { type: 'unicodeEmoji'; value: string }).value).toBe(
      '😀',
    )
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

  // Markdown link
  it('parses markdown link', () => {
    const tokens = parseMfm('click [here](https://example.com) now')
    expect(tokens).toHaveLength(3)
    expect(tokens[1]).toEqual({
      type: 'link',
      label: 'here',
      url: 'https://example.com',
    })
  })

  it('parses silent link ?[text](url)', () => {
    const tokens = parseMfm('?[silent](https://example.com)')
    expect(tokens).toHaveLength(1)
    expect(tokens[0]).toEqual({
      type: 'link',
      label: 'silent',
      url: 'https://example.com',
    })
  })

  // MFM function blocks
  it('parses $[fn content]', () => {
    const tokens = parseMfm('$[spin hello]')
    expect(tokens).toHaveLength(1)
    expect(tokens[0]!.type).toBe('fn')
    const fn = tokens[0] as MfmToken & { type: 'fn' }
    expect(fn.name).toBe('spin')
    expect(fn.args).toEqual({})
    expect(fn.children).toHaveLength(1)
    expect(fn.children[0]).toEqual({ type: 'text', value: 'hello' })
  })

  it('parses $[fn.args content] with key=value args', () => {
    const tokens = parseMfm('$[scale.x=1.2,y=1.2 text]')
    expect(tokens).toHaveLength(1)
    const fn = tokens[0] as MfmToken & { type: 'fn' }
    expect(fn.name).toBe('scale')
    expect(fn.args).toEqual({ x: '1.2', y: '1.2' })
  })

  it('parses $[fn.flag content] with boolean arg', () => {
    const tokens = parseMfm('$[spin.left text]')
    const fn = tokens[0] as MfmToken & { type: 'fn' }
    expect(fn.name).toBe('spin')
    expect(fn.args).toEqual({ left: true })
  })

  it('parses nested $[fn $[fn content]]', () => {
    const tokens = parseMfm('$[spin $[bounce hello]]')
    expect(tokens).toHaveLength(1)
    const outer = tokens[0] as MfmToken & { type: 'fn' }
    expect(outer.name).toBe('spin')
    expect(outer.children).toHaveLength(1)
    const inner = outer.children[0] as MfmToken & { type: 'fn' }
    expect(inner.type).toBe('fn')
    expect(inner.name).toBe('bounce')
    expect(inner.children).toEqual([{ type: 'text', value: 'hello' }])
  })

  it('parses fg/bg color functions', () => {
    const tokens = parseMfm('$[bg.color=51b3fc $[fg.color=000000 text]]')
    const bg = tokens[0] as MfmToken & { type: 'fn' }
    expect(bg.name).toBe('bg')
    expect(bg.args).toEqual({ color: '51b3fc' })
    const fg = bg.children[0] as MfmToken & { type: 'fn' }
    expect(fg.name).toBe('fg')
    expect(fg.args).toEqual({ color: '000000' })
  })

  it('parses custom emoji inside $[fn]', () => {
    const tokens = parseMfm('$[spin :star:]')
    const fn = tokens[0] as MfmToken & { type: 'fn' }
    expect(fn.children).toHaveLength(1)
    expect(fn.children[0]).toEqual({ type: 'customEmoji', shortcode: 'star' })
  })

  // HTML-style tags
  it('parses <small> tag', () => {
    const tokens = parseMfm('<small>small text</small>')
    expect(tokens).toHaveLength(1)
    expect(tokens[0]!.type).toBe('small')
    const small = tokens[0] as MfmToken & { type: 'small' }
    expect(small.children).toEqual([{ type: 'text', value: 'small text' }])
  })

  it('parses <center> tag', () => {
    const tokens = parseMfm('<center>centered</center>')
    expect(tokens).toHaveLength(1)
    expect(tokens[0]!.type).toBe('center')
    const center = tokens[0] as MfmToken & { type: 'center' }
    expect(center.children).toEqual([{ type: 'text', value: 'centered' }])
  })

  it('parses <plain> tag (no inner parsing)', () => {
    const tokens = parseMfm('<plain>**not bold** :emoji:</plain>')
    expect(tokens).toHaveLength(1)
    expect(tokens[0]!.type).toBe('plain')
    const plain = tokens[0] as MfmToken & { type: 'plain' }
    expect(plain.value).toBe('**not bold** :emoji:')
  })

  it('parses inline content around MFM blocks', () => {
    const tokens = parseMfm('before $[spin text] after')
    expect(tokens).toHaveLength(3)
    expect(tokens[0]).toEqual({ type: 'text', value: 'before ' })
    expect(tokens[1]!.type).toBe('fn')
    expect(tokens[2]).toEqual({ type: 'text', value: ' after' })
  })

  it('treats unclosed $[ as text', () => {
    const tokens = parseMfm('$[invalid')
    expect(tokens).toHaveLength(1)
    expect(tokens[0]!.type).toBe('text')
  })
})
