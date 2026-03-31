/// <reference lib="webworker" />

import type { NormalizedNote } from '../adapters/types'
import { filterNotesByRegex } from '../utils/regexSearch'

export interface RegexSearchRequest {
  type: 'filter'
  id: number
  notes: NormalizedNote[]
  pattern: string
}

export interface RegexSearchResponse {
  id: number
  notes: NormalizedNote[]
}

self.onmessage = (event: MessageEvent<RegexSearchRequest>) => {
  const { id, notes, pattern } = event.data
  const filtered = filterNotesByRegex(notes, pattern)
  const response: RegexSearchResponse = { id, notes: filtered }
  self.postMessage(response)
}
