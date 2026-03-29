import type { NormalizedNote } from '@/adapters/types'
import { usePerformanceStore } from '@/stores/performance'

interface Snapshot {
  notes: NormalizedNote[]
  scrollTop: number
  savedAt: number
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

/** Save notes + scroll position for instant restore. */
export function save(
  columnId: string,
  cacheKey: string,
  notes: NormalizedNote[],
  scrollTop: number,
): void {
  const perfStore = usePerformanceStore()
  evictExpired()
  store.set(key(columnId, cacheKey), {
    notes: notes.slice(0, perfStore.get('snapshotMaxNotes')),
    scrollTop,
    savedAt: Date.now(),
  })
}

/** Restore a snapshot without consuming it (for tab switching). */
export function restore(columnId: string, cacheKey: string): Snapshot | null {
  const ttl = usePerformanceStore().get('snapshotTTL') * 60_000
  const snap = store.get(key(columnId, cacheKey))
  if (snap && Date.now() - snap.savedAt < ttl) return snap
  return null
}

/** Restore and consume a snapshot (for column re-mount). */
export function restoreAndConsume(
  columnId: string,
  cacheKey: string,
): Snapshot | null {
  const k = key(columnId, cacheKey)
  const ttl = usePerformanceStore().get('snapshotTTL') * 60_000
  const snap = store.get(k)
  store.delete(k)
  if (snap && Date.now() - snap.savedAt < ttl) return snap
  return null
}

/** Remove all snapshots for a column (e.g. column deletion). */
export function evictColumn(columnId: string): void {
  const prefix = `${columnId}:`
  for (const k of store.keys()) {
    if (k.startsWith(prefix)) store.delete(k)
  }
}
