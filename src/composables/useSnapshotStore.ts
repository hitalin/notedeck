import type { NormalizedNote } from '@/adapters/types'
import { useNoteStore } from '@/stores/notes'
import { usePerformanceStore } from '@/stores/performance'

interface Snapshot {
  noteIds: string[]
  scrollTop: number
  savedAt: number
}

export interface ResolvedSnapshot {
  notes: NormalizedNote[]
  scrollTop: number
}

const store = new Map<string, Snapshot>()

function key(columnId: string, cacheKey: string): string {
  return `${columnId}:${cacheKey}`
}

function evictExpired(): void {
  const ttl = usePerformanceStore().get('snapshotTTL') * 60_000
  const now = Date.now()
  for (const [k, snap] of store) {
    if (now - snap.savedAt >= ttl) store.delete(k)
  }
}

function resolveSnapshot(snap: Snapshot): ResolvedSnapshot | null {
  const notes = useNoteStore().resolve(snap.noteIds)
  if (notes.length === 0) return null
  return { notes, scrollTop: snap.scrollTop }
}

/** Save note IDs + scroll position for instant restore. */
export function save(
  columnId: string,
  cacheKey: string,
  notes: NormalizedNote[],
  scrollTop: number,
): void {
  const maxNotes = usePerformanceStore().get('snapshotMaxNotes')
  evictExpired()
  const ids = notes.slice(0, maxNotes).map((n) => n.id)
  store.set(key(columnId, cacheKey), {
    noteIds: ids,
    scrollTop,
    savedAt: Date.now(),
  })
}

/** Restore a snapshot without consuming it (for tab switching). */
export function restore(
  columnId: string,
  cacheKey: string,
): ResolvedSnapshot | null {
  const ttl = usePerformanceStore().get('snapshotTTL') * 60_000
  const snap = store.get(key(columnId, cacheKey))
  if (snap && Date.now() - snap.savedAt < ttl) return resolveSnapshot(snap)
  return null
}

/** Restore and consume a snapshot (for column re-mount). */
export function restoreAndConsume(
  columnId: string,
  cacheKey: string,
): ResolvedSnapshot | null {
  const k = key(columnId, cacheKey)
  const ttl = usePerformanceStore().get('snapshotTTL') * 60_000
  const snap = store.get(k)
  store.delete(k)
  if (snap && Date.now() - snap.savedAt < ttl) return resolveSnapshot(snap)
  return null
}

/** Remove all snapshots for a column (e.g. column deletion). */
export function evictColumn(columnId: string): void {
  const prefix = `${columnId}:`
  for (const k of store.keys()) {
    if (k.startsWith(prefix)) store.delete(k)
  }
}
