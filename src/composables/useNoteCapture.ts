import { onUnmounted } from 'vue'
import type { NormalizedNote, NoteUpdateEvent, StreamAdapter } from '@/adapters/types'

const MAX_CAPTURE = 100

/**
 * Subscribes displayed notes to Misskey's Note Capture mechanism (subNote/unsubNote)
 * so that reactions, poll votes, and deletions are received in real-time.
 *
 * Only use this for columns WITHOUT channel auto-capture (Mentions, Specified,
 * Favorites, Clip, User). Streaming columns (Timeline, Antenna, Channel, List)
 * already receive noteUpdated via channel auto-capture.
 *
 * Call `sync(notes)` explicitly when notes are added/removed (connect, loadMore,
 * onResume, streaming). Do NOT call on reaction/poll updates — those don't change
 * the set of captured note IDs.
 */
export function useNoteCapture(
  getStream: () => StreamAdapter | undefined,
  onUpdate: (event: NoteUpdateEvent) => void,
) {
  const capturedIds = new Set<string>()

  function sync(notes: NormalizedNote[]) {
    const stream = getStream()
    if (!stream) return

    const capped = notes.slice(0, MAX_CAPTURE)
    const currentIds = new Set<string>()
    for (const note of capped) {
      currentIds.add(note.id)
      if (note.renoteId) currentIds.add(note.renoteId)
    }

    // Subscribe new notes
    for (const id of currentIds) {
      if (!capturedIds.has(id)) {
        capturedIds.add(id)
        stream.subNote(id, onUpdate)
      }
    }

    // Unsubscribe removed notes (scrolled past MAX_CAPTURE or deleted)
    for (const id of capturedIds) {
      if (!currentIds.has(id)) {
        capturedIds.delete(id)
        stream.unsubNote(id)
      }
    }
  }

  function cleanup() {
    const stream = getStream()
    if (stream) {
      for (const id of capturedIds) {
        stream.unsubNote(id)
      }
    }
    capturedIds.clear()
  }

  onUnmounted(cleanup)

  return { sync, cleanup }
}
