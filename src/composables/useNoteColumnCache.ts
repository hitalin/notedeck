import type { NormalizedNote, ServerAdapter } from '@/adapters/types'
import { useNoteStore } from '@/stores/notes'
import { catchLog } from '@/utils/logger'
import { invoke } from '@/utils/tauriInvoke'

// --- Snapshot management (singleton) ---

interface ColumnSnapshot {
  notes: NormalizedNote[]
  scrollTop: number
  savedAt: number
}

const columnSnapshots = new Map<string, ColumnSnapshot>()
const SNAPSHOT_TTL = 5 * 60_000 // 5 minutes

/** Save notes + scroll position for instant restore on re-mount. */
export function saveSnapshot(
  colId: string,
  notes: NormalizedNote[],
  scrollTop: number,
): void {
  columnSnapshots.set(colId, {
    notes: notes.slice(0, 40),
    scrollTop,
    savedAt: Date.now(),
  })
}

/** Restore and consume a snapshot if it exists and hasn't expired. */
export function restoreSnapshot(colId: string): ColumnSnapshot | null {
  const snapshot = columnSnapshots.get(colId)
  columnSnapshots.delete(colId)
  if (snapshot && Date.now() - snapshot.savedAt < SNAPSHOT_TTL) {
    return snapshot
  }
  return null
}

// --- Cache invocations ---

/** Load cached notes from SQLite. */
export async function loadCachedTimeline(
  accountId: string,
  timelineType: string,
  limit = 40,
): Promise<NormalizedNote[]> {
  return invoke<NormalizedNote[]>('api_get_cached_timeline', {
    accountId,
    timelineType,
    limit,
  })
}

/** Load older cached notes before a given timestamp. */
export async function loadCachedTimelineBefore(
  accountId: string,
  timelineType: string,
  before: string,
  limit = 40,
): Promise<NormalizedNote[]> {
  return invoke<NormalizedNote[]>('api_get_cached_timeline_before', {
    accountId,
    timelineType,
    before,
    limit,
  })
}

/**
 * Background-verify that cached notes still exist on the server.
 * Any note returning 404 is purged from noteStore + DB cache.
 * Confirmed notes are refreshed with latest data.
 */
export async function purgeStaleCachedNotes(
  adapter: ServerAdapter,
  idsToVerify: string[],
  isStillMounted: () => boolean,
): Promise<void> {
  const noteStore = useNoteStore()
  const BATCH_SIZE = 5
  for (let i = 0; i < idsToVerify.length; i += BATCH_SIZE) {
    if (!isStillMounted()) return
    const batch = idsToVerify.slice(i, i + BATCH_SIZE)
    await Promise.allSettled(
      batch.map(async (id) => {
        try {
          const fresh = await adapter.api.getNote(id)
          noteStore.update(id, fresh)
        } catch {
          noteStore.remove(id)
          invoke('api_delete_cached_note', { noteId: id }).catch(
            catchLog('delete-cached-note'),
          )
        }
      }),
    )
  }
}
