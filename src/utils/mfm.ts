import { char2twemojiUrl } from './twemoji'

export type MfmToken =
  | { type: 'text'; value: string }
  | { type: 'url'; value: string }
  | { type: 'mention'; username: string; host: string | null; acct: string }
  | { type: 'hashtag'; value: string }
  | { type: 'bold'; value: string }
  | { type: 'italic'; value: string }
  | { type: 'strike'; value: string }
  | { type: 'inlineCode'; value: string }
  | { type: 'customEmoji'; shortcode: string }
  | { type: 'unicodeEmoji'; value: string; url: string }

const emojiRegex = /(?:\p{Emoji_Presentation}|\p{Emoji}\uFE0F)(?:\u200D(?:\p{Emoji_Presentation}|\p{Emoji}\uFE0F))*/gu

interface PatternDef {
  regex: RegExp
  parse: (m: RegExpExecArray) => MfmToken
}

const patterns: PatternDef[] = [
  // Inline code (highest priority — no further parsing inside)
  {
    regex: /`([^`\n]+)`/g,
    parse: (m) => ({ type: 'inlineCode', value: m[1]! }),
  },
  // URL
  {
    regex: /https?:\/\/[\w\-._~:/?#[\]@!$&'()*+,;=%]+/g,
    parse: (m) => ({ type: 'url', value: m[0] }),
  },
  // Custom emoji
  {
    regex: /:([a-zA-Z0-9_]+(?:@[\w.-]+)?):/g,
    parse: (m) => ({ type: 'customEmoji', shortcode: m[1]! }),
  },
  // Bold
  {
    regex: /\*\*(.+?)\*\*/g,
    parse: (m) => ({ type: 'bold', value: m[1]! }),
  },
  // Italic (single *, but not **)
  {
    regex: /(?<!\*)\*([^*\n]+?)\*(?!\*)/g,
    parse: (m) => ({ type: 'italic', value: m[1]! }),
  },
  // Strikethrough
  {
    regex: /~~(.+?)~~/g,
    parse: (m) => ({ type: 'strike', value: m[1]! }),
  },
  // Mention (@user or @user@host) — must be at start or after whitespace
  {
    regex: /(?<=^|[\s(])@(\w+)(?:@([\w.-]+))?/g,
    parse: (m) => ({
      type: 'mention',
      username: m[1]!,
      host: m[2] ?? null,
      acct: m[0].trimStart(),
    }),
  },
  // Hashtag — must be at start or after whitespace
  {
    regex: /(?<=^|[\s(])#([\w\u3000-\u303f\u3040-\u309f\u30a0-\u30ff\uff00-\uffef\u4e00-\u9faf]+)/g,
    parse: (m) => ({ type: 'hashtag', value: m[1]! }),
  },
  // Unicode emoji (lowest priority)
  {
    regex: emojiRegex,
    parse: (m) => ({ type: 'unicodeEmoji', value: m[0], url: char2twemojiUrl(m[0]) }),
  },
]

export function parseMfm(text: string): MfmToken[] {
  if (!text) return []

  const tokens: MfmToken[] = []
  let remaining = text

  while (remaining.length > 0) {
    let earliest: { index: number; length: number; token: MfmToken } | null = null

    for (const pattern of patterns) {
      pattern.regex.lastIndex = 0
      const m = pattern.regex.exec(remaining)
      if (m && (!earliest || m.index < earliest.index)) {
        earliest = {
          index: m.index,
          length: m[0].length,
          token: pattern.parse(m),
        }
      }
    }

    if (!earliest) {
      tokens.push({ type: 'text', value: remaining })
      break
    }

    if (earliest.index > 0) {
      tokens.push({ type: 'text', value: remaining.slice(0, earliest.index) })
    }

    tokens.push(earliest.token)
    remaining = remaining.slice(earliest.index + earliest.length)
  }

  return tokens
}
