import type { NormalizedNote } from '@/adapters/types'
import { parseCacheHas, warmCache } from '@/utils/mfm'
import { createWorkerClient } from '@/utils/workerClient'
import type { MfmParseResponse } from '@/workers/mfmWorker'

const mfmWorker = createWorkerClient<MfmParseResponse>(
  () =>
    new Worker(new URL('../workers/mfmWorker.ts', import.meta.url), {
      type: 'module',
    }),
)

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

  mfmWorker
    .post({ type: 'parse', texts })
    .then(({ results }) => {
      for (const { text, tokens } of results) {
        warmCache(text, tokens)
      }
    })
    .catch(() => {
      // Worker blocked by CSP — MFM will be parsed on-demand in the main thread
    })
}
