/**
 * Minimal YAML-subset frontmatter parser/serializer for skill files.
 *
 * 受け付ける文法 (フラットな key: value のみ):
 *   key: string             // クオート任意 (' or ")
 *   key: 123                // number
 *   key: true | false       // boolean
 *   key: [a, b, c]          // 文字列配列 (1 行)
 *   key:                    // 空文字列
 *
 * ネストしたオブジェクト・複数行配列はサポートしない (skill メタは flat 前提)。
 * 不正な行は黙ってスキップ。フロントマターが無いファイルは body 全体を返す。
 */

export type FrontmatterValue = string | number | boolean | string[]

export type Frontmatter = Record<string, FrontmatterValue>

export interface ParsedSkillFile {
  meta: Frontmatter
  body: string
}

const FRONTMATTER_RE = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/

export function parseSkillFile(raw: string): ParsedSkillFile {
  const m = raw.match(FRONTMATTER_RE)
  if (!m) return { meta: {}, body: raw }
  const meta = parseFrontmatter(m[1] ?? '')
  const body = raw.slice(m[0].length)
  return { meta, body }
}

function parseFrontmatter(text: string): Frontmatter {
  const out: Frontmatter = {}
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.replace(/^\s+|\s+$/g, '')
    if (!line || line.startsWith('#')) continue
    const idx = line.indexOf(':')
    if (idx <= 0) continue
    const key = line.slice(0, idx).trim()
    const valueRaw = line.slice(idx + 1).trim()
    out[key] = parseValue(valueRaw)
  }
  return out
}

function parseValue(raw: string): FrontmatterValue {
  if (raw === '') return ''
  if (raw === 'true') return true
  if (raw === 'false') return false
  if (raw.startsWith('[') && raw.endsWith(']')) {
    return parseInlineArray(raw)
  }
  // number (integer or float, no exponent)
  if (/^-?\d+(\.\d+)?$/.test(raw)) return Number(raw)
  return stripQuotes(raw)
}

function parseInlineArray(raw: string): string[] {
  const inner = raw.slice(1, -1).trim()
  if (!inner) return []
  return inner.split(',').map((s) => stripQuotes(s.trim()))
}

function stripQuotes(s: string): string {
  if (s.length >= 2) {
    const first = s[0]
    const last = s[s.length - 1]
    if ((first === '"' || first === "'") && first === last) {
      return s.slice(1, -1)
    }
  }
  return s
}

export function serializeSkillFile(meta: Frontmatter, body: string): string {
  const lines: string[] = ['---']
  for (const [key, value] of Object.entries(meta)) {
    if (value === undefined) continue
    lines.push(`${key}: ${serializeValue(value)}`)
  }
  lines.push('---', '')
  return `${lines.join('\n')}${body}`
}

function serializeValue(value: FrontmatterValue): string {
  if (Array.isArray(value)) {
    return `[${value.map(quoteIfNeeded).join(', ')}]`
  }
  if (typeof value === 'boolean' || typeof value === 'number') {
    return String(value)
  }
  return quoteIfNeeded(value)
}

const NEEDS_QUOTE = /[:#,[\]]|^\s|\s$|^$|^(true|false|null)$|^-?\d+(\.\d+)?$/

function quoteIfNeeded(s: string): string {
  if (NEEDS_QUOTE.test(s)) {
    return `'${s.replace(/'/g, "''")}'`
  }
  return s
}
