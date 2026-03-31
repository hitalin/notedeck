/// <reference lib="webworker" />

import type { NormalizedNote } from '../adapters/types'

export interface DedupRequest {
  type: 'dedup'
  id: number
  notes: NormalizedNote[]
  existingIds: string[] | null
}

export interface DedupResponse {
  id: number
  notes: NormalizedNote[]
}

/** 既存IDを除外し、createdAt降順でソート */
function dedup(
  incoming: NormalizedNote[],
  existingIds?: Set<string>,
): NormalizedNote[] {
  const seen = existingIds ?? new Set<string>()
  return incoming
    .filter((n) => {
      if (seen.has(n.id)) return false
      seen.add(n.id)
      return true
    })
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
}

self.onmessage = (event: MessageEvent<DedupRequest>) => {
  const { id, notes, existingIds } = event.data
  const existing = existingIds ? new Set(existingIds) : undefined
  const result = dedup(notes, existing)
  const response: DedupResponse = { id, notes: result }
  self.postMessage(response)
}
