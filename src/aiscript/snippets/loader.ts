import type { Completion } from '@codemirror/autocomplete'
import { snippetCompletion } from '@codemirror/autocomplete'
import { listSnippetFiles, readSnippetFile } from '@/utils/settingsFs'
import { parseSnippetFile } from './parse'
import type { ParsedSnippet } from './types'

export const DEFAULT_SNIPPETS_FILE = 'aiscript.json5'

export async function loadAllSnippets(): Promise<ParsedSnippet[]> {
  const files = await listSnippetFiles()
  const all: ParsedSnippet[] = []
  for (const file of files) {
    try {
      const raw = await readSnippetFile(file)
      all.push(...parseSnippetFile(raw, file))
    } catch (e) {
      console.warn(`[snippets] failed to read ${file}:`, e)
    }
  }
  return all
}

export function toCompletion(snippet: ParsedSnippet): Completion {
  return snippetCompletion(snippet.body, {
    label: snippet.prefix,
    type: 'snippet',
    detail: snippet.name,
    info: snippet.description,
    boost: 50,
  })
}

export async function loadSnippetCompletions(): Promise<Completion[]> {
  const all = await loadAllSnippets()
  return all.map(toCompletion)
}
