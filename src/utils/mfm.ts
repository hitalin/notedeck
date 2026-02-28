import { char2twemojiUrl } from './twemoji'

export type MfmToken =
  | { type: 'text'; value: string }
  | { type: 'url'; value: string }
  | { type: 'link'; label: string; url: string }
  | { type: 'mention'; username: string; host: string | null; acct: string }
  | { type: 'hashtag'; value: string }
  | { type: 'bold'; value: string }
  | { type: 'italic'; value: string }
  | { type: 'strike'; value: string }
  | { type: 'inlineCode'; value: string }
  | { type: 'customEmoji'; shortcode: string }
  | { type: 'unicodeEmoji'; value: string; url: string }
  | {
      type: 'fn'
      name: string
      args: Record<string, string | true>
      children: MfmToken[]
    }
  | { type: 'small'; children: MfmToken[] }
  | { type: 'center'; children: MfmToken[] }
  | { type: 'plain'; value: string }

const emojiRegex =
  /(?:\p{Emoji_Presentation}|\p{Emoji}\uFE0F)(?:\u200D(?:\p{Emoji_Presentation}|\p{Emoji}\uFE0F))*/gu

interface PatternDef {
  regex: RegExp
  parse: (m: RegExpExecArray) => MfmToken
}

const inlinePatterns: PatternDef[] = [
  {
    regex: /`([^`\n]+)`/g,
    parse: (m) => ({ type: 'inlineCode', value: m[1] }),
  },
  {
    regex: /\??\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g,
    parse: (m) => ({ type: 'link', label: m[1], url: m[2] }),
  },
  {
    regex: /https?:\/\/[\w\-._~:/?#[\]@!$&'()*+,;=%]+/g,
    parse: (m) => ({ type: 'url', value: m[0] }),
  },
  {
    regex: /:([a-zA-Z0-9_]+(?:@[\w.-]+)?):/g,
    parse: (m) => ({ type: 'customEmoji', shortcode: m[1] }),
  },
  {
    regex: /\*\*(.+?)\*\*/g,
    parse: (m) => ({ type: 'bold', value: m[1] }),
  },
  {
    regex: /(?<!\*)\*([^*\n]+?)\*(?!\*)/g,
    parse: (m) => ({ type: 'italic', value: m[1] }),
  },
  {
    regex: /~~(.+?)~~/g,
    parse: (m) => ({ type: 'strike', value: m[1] }),
  },
  {
    regex: /(?<=^|[\s(])@(\w+)(?:@([\w.-]+))?/g,
    parse: (m) => ({
      type: 'mention',
      username: m[1],
      host: m[2] ?? null,
      acct: m[0].trimStart(),
    }),
  },
  {
    regex:
      /(?<=^|[\s(])#([\w\u3000-\u303f\u3040-\u309f\u30a0-\u30ff\uff00-\uffef\u4e00-\u9faf]+)/g,
    parse: (m) => ({ type: 'hashtag', value: m[1] }),
  },
  {
    regex: emojiRegex,
    parse: (m) => ({
      type: 'unicodeEmoji',
      value: m[0],
      url: char2twemojiUrl(m[0]),
    }),
  },
]

function parseFnBlock(
  text: string,
  pos: number,
): { end: number; token: MfmToken } | null {
  if (text[pos] !== '$' || text[pos + 1] !== '[') return null
  let i = pos + 2

  const nameMatch = /^\w+/.exec(text.slice(i))
  if (!nameMatch) return null
  const name = nameMatch[0]
  i += name.length

  const args: Record<string, string | true> = {}
  if (text[i] === '.') {
    i++
    const argsMatch = /^[^\s\]]+/.exec(text.slice(i))
    if (argsMatch) {
      for (const part of argsMatch[0].split(',')) {
        const eq = part.indexOf('=')
        if (eq >= 0) {
          args[part.slice(0, eq)] = part.slice(eq + 1)
        } else {
          args[part] = true
        }
      }
      i += argsMatch[0].length
    }
  }

  if (text[i] !== ' ') return null
  i++

  let depth = 1
  const contentStart = i
  while (i < text.length && depth > 0) {
    if (text[i] === '$' && text[i + 1] === '[') {
      depth++
      i += 2
    } else if (text[i] === ']') {
      depth--
      if (depth === 0) break
      i++
    } else {
      i++
    }
  }

  if (depth !== 0) return null

  const content = text.slice(contentStart, i)
  return {
    end: i + 1,
    token: { type: 'fn', name, args, children: parseTokens(content) },
  }
}

function parseTagBlock(
  text: string,
  pos: number,
): { end: number; token: MfmToken } | null {
  for (const tag of ['small', 'center', 'plain'] as const) {
    const open = `<${tag}>`
    if (!text.startsWith(open, pos)) continue
    const close = `</${tag}>`
    const closeIdx = text.indexOf(close, pos + open.length)
    if (closeIdx < 0) continue
    const content = text.slice(pos + open.length, closeIdx)
    const end = closeIdx + close.length
    if (tag === 'plain') {
      return { end, token: { type: 'plain', value: content } }
    }
    return { end, token: { type: tag, children: parseTokens(content) } }
  }
  return null
}

type BlockMatch = { index: number; consumeLength: number; token: MfmToken }

function findFirstBlock(
  text: string,
  needle: string,
  tryParse: (
    text: string,
    pos: number,
  ) => { end: number; token: MfmToken } | null,
): BlockMatch | null {
  let from = 0
  while (from < text.length) {
    const idx = text.indexOf(needle, from)
    if (idx < 0) return null
    const result = tryParse(text, idx)
    if (result) {
      return {
        index: idx,
        consumeLength: result.end - idx,
        token: result.token,
      }
    }
    from = idx + 1
  }
  return null
}

function parseTokens(text: string): MfmToken[] {
  if (!text) return []

  const tokens: MfmToken[] = []
  let remaining = text

  while (remaining.length > 0) {
    let earliest: BlockMatch | null = null

    // Block-level patterns
    const blockCandidates = [
      findFirstBlock(remaining, '$[', parseFnBlock),
      findFirstBlock(remaining, '<small>', parseTagBlock),
      findFirstBlock(remaining, '<center>', parseTagBlock),
      findFirstBlock(remaining, '<plain>', parseTagBlock),
    ]
    for (const c of blockCandidates) {
      if (c && (!earliest || c.index < earliest.index)) {
        earliest = c
      }
    }

    // Inline patterns
    for (const pattern of inlinePatterns) {
      pattern.regex.lastIndex = 0
      const m = pattern.regex.exec(remaining)
      if (m && (!earliest || m.index < earliest.index)) {
        earliest = {
          index: m.index,
          consumeLength: m[0].length,
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
    remaining = remaining.slice(earliest.index + earliest.consumeLength)
  }

  return tokens
}

const parseCache = new Map<string, MfmToken[]>()
const CACHE_MAX = 2048

export function parseMfm(text: string): MfmToken[] {
  if (!text) return []

  const cached = parseCache.get(text)
  if (cached) {
    // LRU: move to end so it's evicted last
    parseCache.delete(text)
    parseCache.set(text, cached)
    return cached
  }

  const tokens = parseTokens(text)

  if (parseCache.size >= CACHE_MAX) {
    const first = parseCache.keys().next().value
    if (first !== undefined) parseCache.delete(first)
  }
  parseCache.set(text, tokens)

  return tokens
}
