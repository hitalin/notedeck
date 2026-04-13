import type { Completion } from '@codemirror/autocomplete'
import { loadSnippetCompletions } from './loader'

let cached: Completion[] = []
let initialLoad: Promise<void> | null = null

function kickInitialLoad(): Promise<void> {
  if (!initialLoad) {
    initialLoad = loadSnippetCompletions()
      .then((arr) => {
        cached = arr
      })
      .catch((e) => {
        console.warn('[snippets] initial load failed:', e)
      })
  }
  return initialLoad
}

// Kick off an initial load at module import time so that CodeMirror
// completions see snippets as soon as possible.
void kickInitialLoad()

/** Synchronous read — returns whatever is currently loaded (may be empty on first paint). */
export function getSnippetCompletions(): Completion[] {
  return cached
}

/** Force a reload from disk and update the cache. */
export async function reloadSnippets(): Promise<Completion[]> {
  try {
    cached = await loadSnippetCompletions()
  } catch (e) {
    console.warn('[snippets] reload failed:', e)
  }
  return cached
}
