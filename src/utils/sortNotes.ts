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

/**
 * Merge two already-sorted (desc) note arrays into one sorted array.
 * O(n + m) instead of O((n+m) log(n+m)).
 */
export function mergeSortedNotes(
  a: NormalizedNote[],
  b: NormalizedNote[],
): NormalizedNote[] {
  const result: NormalizedNote[] = new Array(a.length + b.length)
  let i = 0
  let j = 0
  let k = 0
  while (i < a.length && j < b.length) {
    result[k++] = a[i].createdAt >= b[j].createdAt ? a[i++] : b[j++]
  }
  while (i < a.length) result[k++] = a[i++]
  while (j < b.length) result[k++] = b[j++]
  return result
}

/**
 * Insert a small batch of notes into an already-sorted (desc) array.
 * Sorts the batch first, then merges. O(m log m + n + m) ≈ O(n) when m << n.
 */
export function insertIntoSorted(
  sorted: NormalizedNote[],
  batch: NormalizedNote[],
): NormalizedNote[] {
  if (batch.length === 0) return sorted
  if (sorted.length === 0) return sortByCreatedAtDesc([...batch])
  const sortedBatch = sortByCreatedAtDesc([...batch])
  return mergeSortedNotes(sortedBatch, sorted)
}
