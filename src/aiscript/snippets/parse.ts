import JSON5 from 'json5'
import type { ParsedSnippet, SnippetFile, VSCodeSnippet } from './types'

/**
 * VSCode スニペットの body を CodeMirror snippet テンプレート構文へ変換する。
 *
 * サポート：
 * - `$1`, `$2`, ... → `#{1}`, `#{2}` （番号付きタブストップ）
 * - `${1:default}` → `#{1:default}`
 * - `$0` / `${0}` / `${0:...}` → `#{}` （終了位置）
 * - `${1|a,b,c|}` → `#{1:a}` + console.warn（choice は未対応なので先頭候補を採用）
 * - `$TM_FILENAME` 等 VSCode 変数 → 空文字に落とす
 *
 * CodeMirror は `#{name}` と `#{name:default}` を解釈する
 * （`$` ではなく `#` に置換しているのは @codemirror/autocomplete の仕様）。
 */
export function vscodeBodyToCmTemplate(body: string | string[]): string {
  const raw = Array.isArray(body) ? body.join('\n') : body

  let text = raw

  // 1) ${N|a,b,c|} choice → #{N:firstChoice}
  text = text.replace(
    /\$\{(\d+)\|([^|}]*)(?:,[^|}]*)*\|\}/g,
    (_m, n: string, first: string) => {
      console.warn(
        `[snippets] choice syntax \${${n}|...|} is not supported; using first option "${first}"`,
      )
      return `#{${n}:${first}}`
    },
  )

  // 2) $0 / ${0} / ${0:...} → #{} （終了位置）
  text = text.replace(/\$\{0(?::[^}]*)?\}/g, '#{}')
  text = text.replace(/\$0(?!\d)/g, '#{}')

  // 3) ${N:default} → #{N:default}
  text = text.replace(
    /\$\{(\d+):([^}]*)\}/g,
    (_m, n: string, def: string) => `#{${n}:${def}}`,
  )

  // 4) ${N} → #{N}
  text = text.replace(/\$\{(\d+)\}/g, (_m, n: string) => `#{${n}}`)

  // 5) $N → #{N} （先頭に数字、後続は非数字）
  text = text.replace(/\$(\d+)(?!\d)/g, (_m, n: string) => `#{${n}}`)

  // 6) ${VAR} / $VAR （VSCode 変数）→ 空文字
  text = text.replace(/\$\{[A-Z_][A-Z0-9_]*(?::[^}]*)?\}/g, '')
  text = text.replace(/\$[A-Z_][A-Z0-9_]*/g, '')

  return text
}

/**
 * スニペットファイルの JSON5 をパースし、検証済みスニペット配列を返す。
 * 個別エントリの不正は console.warn でスキップし、他のエントリは採用する。
 */
export function parseSnippetFile(
  raw: string,
  sourceName: string,
): ParsedSnippet[] {
  if (!raw.trim()) return []

  let data: unknown
  try {
    data = JSON5.parse(raw)
  } catch (e) {
    console.warn(`[snippets] failed to parse ${sourceName}:`, e)
    return []
  }

  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    console.warn(`[snippets] ${sourceName}: top-level must be an object`)
    return []
  }

  const result: ParsedSnippet[] = []
  const file = data as SnippetFile

  for (const [name, entry] of Object.entries(file)) {
    if (!entry || typeof entry !== 'object') {
      console.warn(`[snippets] ${sourceName}: "${name}" is not an object`)
      continue
    }
    const snippet = entry as VSCodeSnippet
    if (snippet.prefix == null || snippet.body == null) {
      console.warn(`[snippets] ${sourceName}: "${name}" missing prefix or body`)
      continue
    }
    const prefixes = Array.isArray(snippet.prefix)
      ? snippet.prefix
      : [snippet.prefix]
    const bodyTemplate = vscodeBodyToCmTemplate(snippet.body)

    for (const prefix of prefixes) {
      if (typeof prefix !== 'string' || !prefix) continue
      result.push({
        name,
        prefix,
        body: bodyTemplate,
        description:
          typeof snippet.description === 'string'
            ? snippet.description
            : undefined,
        source: sourceName,
      })
    }
  }

  return result
}
