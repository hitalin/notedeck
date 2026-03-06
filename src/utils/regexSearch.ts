import type { NormalizedNote } from '@/adapters/types'

/**
 * 正規表現パターンからリテラル部分を抽出し、FTS5/サーバー検索のヒントにする。
 * 例: "(cat|dog).*food" → "food"（最長リテラル部分）
 */
export function extractLiterals(pattern: string): string {
  // 正規表現メタ文字でスプリットしてリテラル部分を取得
  const parts = pattern
    .split(/[\\^$.*+?()[\]{}|]/)
    .map((s) => s.trim())
    .filter((s) => s.length >= 2)
  if (parts.length === 0) return ''
  // 最長のリテラル部分を返す
  return parts.sort((a, b) => b.length - a.length)[0]
}

/**
 * 安全に RegExp を生成する。無効なパターンの場合は null を返す。
 */
export function safeRegex(pattern: string): RegExp | null {
  try {
    return new RegExp(pattern, 'i')
  } catch {
    return null
  }
}

/**
 * 正規表現パターンが有効かどうかを判定する。
 */
export function isValidRegex(pattern: string): boolean {
  return safeRegex(pattern) !== null
}

/**
 * ノートのテキスト（text + CW + ユーザー名）に正規表現がマッチするか判定。
 */
function noteMatchesRegex(note: NormalizedNote, regex: RegExp): boolean {
  if (note.text && regex.test(note.text)) return true
  if (note.cw && regex.test(note.cw)) return true
  if (note.user.name && regex.test(note.user.name)) return true
  if (regex.test(note.user.username)) return true
  // Renote の中身もチェック
  if (note.renote) {
    if (note.renote.text && regex.test(note.renote.text)) return true
    if (note.renote.cw && regex.test(note.renote.cw)) return true
  }
  return false
}

/**
 * ノート配列を正規表現でフィルタリング。
 */
export function filterNotesByRegex(
  notes: NormalizedNote[],
  pattern: string,
): NormalizedNote[] {
  const regex = safeRegex(pattern)
  if (!regex) return notes
  return notes.filter((note) => noteMatchesRegex(note, regex))
}

/** フィルタ条件の種別 */
export type FilterConditionType = 'contains_any' | 'contains_all' | 'excludes'

export const FILTER_CONDITION_LABELS: Record<FilterConditionType, string> = {
  contains_any: 'いずれかを含む',
  contains_all: 'すべてを含む',
  excludes: '除外する',
}

export interface FilterCondition {
  type: FilterConditionType
  words: string
}

/** エスケープして安全にリテラル文字列を正規表現に埋め込む */
function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** フィルタ条件から正規表現パターンを生成 */
export function buildRegexFromConditions(
  conditions: FilterCondition[],
): string {
  const parts: string[] = []

  for (const cond of conditions) {
    const words = cond.words
      .split(/[,、\s]+/)
      .map((w) => w.trim())
      .filter(Boolean)
    if (words.length === 0) continue

    const escaped = words.map(escapeRegex)

    switch (cond.type) {
      case 'contains_any':
        parts.push(`(?:${escaped.join('|')})`)
        break
      case 'contains_all':
        for (const w of escaped) {
          parts.push(`(?=.*${w})`)
        }
        break
      case 'excludes':
        for (const w of escaped) {
          parts.push(`(?!.*${w})`)
        }
        break
    }
  }

  if (parts.length === 0) return ''

  // contains_all と excludes は先読みなので先頭に、contains_any は後に
  const lookaheads = parts.filter(
    (p) => p.startsWith('(?=') || p.startsWith('(?!'),
  )
  const matches = parts.filter(
    (p) => !p.startsWith('(?=') && !p.startsWith('(?!'),
  )

  if (lookaheads.length > 0 && matches.length > 0) {
    return `^${lookaheads.join('')}.*${matches.join('.*')}`
  }
  if (lookaheads.length > 0) {
    return `^${lookaheads.join('')}`
  }
  return matches.join('.*')
}

/** フィルタ条件から検索ヒント（FTS5 用）を抽出 */
export function extractHintFromConditions(
  conditions: FilterCondition[],
): string {
  // contains_any / contains_all のワードから最長のものを返す
  const words: string[] = []
  for (const cond of conditions) {
    if (cond.type === 'excludes') continue
    const ws = cond.words
      .split(/[,、\s]+/)
      .map((w) => w.trim())
      .filter(Boolean)
    words.push(...ws)
  }
  if (words.length === 0) return ''
  return words.sort((a, b) => b.length - a.length)[0]
}
