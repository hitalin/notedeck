import type { NormalizedNote } from '@/adapters/types'
import { parseCacheHas, warmCache } from '@/utils/mfm'
import type { MfmParseResponse } from '@/workers/mfmWorker'

let worker: Worker | null = null
let requestId = 0
const pending = new Map<
  number,
  (results: MfmParseResponse['results']) => void
>()

function getWorker(): Worker {
  if (!worker) {
    worker = new Worker(new URL('../workers/mfmWorker.ts', import.meta.url), {
      type: 'module',
    })
    worker.onmessage = (event: MessageEvent<MfmParseResponse>) => {
      const { id, results } = event.data
      const resolve = pending.get(id)
      if (resolve) {
        pending.delete(id)
        resolve(results)
      }
    }
  }
  return worker
}

/**
 * Prefetch MFM parse results for notes about to enter the viewport.
 * Runs parsing in a Web Worker and injects results into the main-thread cache
 * so that MkMfm's synchronous parseMfm() call gets a cache hit.
 */
export function prefetchNoteMfm(notes: NormalizedNote[]): void {
  const texts: string[] = []
  for (const note of notes) {
    const effective = note.renote ?? note
    if (effective.text && !parseCacheHas(effective.text)) {
      texts.push(effective.text)
    }
  }
  if (texts.length === 0) return

  const id = requestId++
  getWorker().postMessage({ type: 'parse', id, texts })
  pending.set(id, (results) => {
    for (const { text, tokens } of results) {
      warmCache(text, tokens)
    }
  })
}
