const TWEMOJI_BASE = 'https://cdn.jsdelivr.net/gh/jdecked/twemoji@latest/assets/svg'

/** Convert a Unicode emoji character to a Twemoji CDN SVG URL */
export function char2twemojiUrl(char: string): string {
  let codes = Array.from(char, x => x.codePointAt(0)?.toString(16))
  if (!codes.includes('200d')) codes = codes.filter(x => x !== 'fe0f')
  codes = codes.filter(x => x && x.length)
  return `${TWEMOJI_BASE}/${codes.join('-')}.svg`
}

/**
 * Regex to match Unicode emoji sequences.
 * Covers emoji presentation, variation selectors, ZWJ sequences, keycaps, and flags.
 */
const emojiRegex = /(?:\p{Emoji_Presentation}|\p{Emoji}\uFE0F)(?:\u200D(?:\p{Emoji_Presentation}|\p{Emoji}\uFE0F))*/gu

/** Split text into segments of plain text and Unicode emoji */
export function splitTextWithEmoji(text: string): { type: 'text' | 'emoji'; value: string; url?: string }[] {
  const segments: { type: 'text' | 'emoji'; value: string; url?: string }[] = []
  emojiRegex.lastIndex = 0
  let lastIndex = 0
  let m: RegExpExecArray | null
  while ((m = emojiRegex.exec(text)) !== null) {
    if (m.index > lastIndex) {
      segments.push({ type: 'text', value: text.slice(lastIndex, m.index) })
    }
    segments.push({ type: 'emoji', value: m[0], url: char2twemojiUrl(m[0]) })
    lastIndex = m.index + m[0].length
  }
  if (lastIndex < text.length) {
    segments.push({ type: 'text', value: text.slice(lastIndex) })
  }
  return segments
}
