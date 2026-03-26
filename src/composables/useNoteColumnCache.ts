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
    notes: notes.slice(0, 30),
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
 * Uses a single bulk IPC call to verify all notes in parallel on the Rust side.
 * Missing notes are purged from noteStore + DB cache; confirmed notes are refreshed.
 */
export async function purgeStaleCachedNotes(
  _adapter: ServerAdapter,
  idsToVerify: string[],
  isStillMounted: () => boolean,
  accountId: string,
): Promise<void> {
  if (idsToVerify.length === 0 || !isStillMounted()) return

  const noteStore = useNoteStore()
  try {
    const verified = await invoke<Record<string, NormalizedNote>>(
      'api_verify_notes',
      { accountId, noteIds: idsToVerify },
    )

    if (!isStillMounted()) return

    const verifiedIds = new Set(Object.keys(verified))

    // Update confirmed notes with fresh data
    for (const [id, fresh] of Object.entries(verified)) {
      noteStore.update(id, fresh)
    }

    // Purge notes that no longer exist on the server
    for (const id of idsToVerify) {
      if (!verifiedIds.has(id)) {
        noteStore.remove(id)
        invoke('api_delete_cached_note', { noteId: id }).catch(
          catchLog('delete-cached-note'),
        )
      }
    }
  } catch {
    // Bulk verify failed — silently ignore (notes stay cached)
  }
}
