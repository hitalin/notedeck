import type { NormalizedNote } from '@/adapters/types'

/**
 * Sort notes by createdAt in descending order (newest first).
 * In-place sort — caller must pass a new array (e.g. from spread).
 */
export function sortByCreatedAtDesc(notes: NormalizedNote[]): NormalizedNote[] {
  return notes.sort((a, b) =>
    a.createdAt > b.createdAt ? -1 : a.createdAt < b.createdAt ? 1 : 0,
  )
}
