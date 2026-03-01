import { onUnmounted, watch, type Ref } from 'vue'
import type { NormalizedNote, NoteUpdateEvent, StreamAdapter } from '@/adapters/types'

const MAX_CAPTURE = 100

/**
 * Subscribes displayed notes to Misskey's Note Capture mechanism (subNote/unsubNote)
 * so that reactions, poll votes, and deletions are received in real-time.
 *
 * Only use this for columns WITHOUT channel auto-capture (Mentions, Specified,
 * Favorites, Clip, User). Streaming columns (Timeline, Antenna, Channel, List)
 * already receive noteUpdated via channel auto-capture.
 */
export function useNoteCapture(
  notes: Ref<NormalizedNote[]>,
  getStream: () => StreamAdapter | undefined,
  onUpdate: (event: NoteUpdateEvent) => void,
) {
  const capturedIds = new Set<string>()
  let prevIdKey = ''

  function syncCapture() {
    const stream = getStream()
    if (!stream) return

    // Collect current IDs (capped to most recent MAX_CAPTURE notes)
    const capped = notes.value.slice(0, MAX_CAPTURE)
    const currentIds = new Set<string>()
    for (const note of capped) {
      currentIds.add(note.id)
      if (note.renoteId) currentIds.add(note.renoteId)
    }

    // Skip if IDs haven't changed (e.g. reaction update only mutated values)
    const idKey = [...currentIds].join(',')
    if (idKey === prevIdKey) return
    prevIdKey = idKey

    // Subscribe new notes
    for (const id of currentIds) {
      if (!capturedIds.has(id)) {
        capturedIds.add(id)
        stream.subNote(id, onUpdate)
      }
    }

    // Unsubscribe removed notes
    for (const id of capturedIds) {
      if (!currentIds.has(id)) {
        capturedIds.delete(id)
        stream.unsubNote(id)
      }
    }
  }

  const stopWatch = watch(notes, syncCapture, { immediate: true })

  function cleanup() {
    stopWatch()
    const stream = getStream()
    if (stream) {
      for (const id of capturedIds) {
        stream.unsubNote(id)
      }
    }
    capturedIds.clear()
    prevIdKey = ''
  }

  onUnmounted(cleanup)

  return { cleanup }
}
