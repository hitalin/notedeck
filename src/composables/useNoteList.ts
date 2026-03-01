import { shallowRef } from 'vue'
import type {
  NormalizedNote,
  NoteUpdateEvent,
  ServerAdapter,
} from '@/adapters/types'
import { applyNoteUpdate } from '@/utils/noteUpdate'

export interface UseNoteListOptions {
  getMyUserId: () => string | undefined
  getAdapter: () => ServerAdapter | null
  deleteHandler: (note: NormalizedNote) => Promise<boolean>
  closePostForm: () => void
  onNotesChanged?: (notes: NormalizedNote[]) => void
}

export function useNoteList(options: UseNoteListOptions) {
  const notes = shallowRef<NormalizedNote[]>([])
  const noteIds = new Set<string>()
  let onNotesChangedFn = options.onNotesChanged

  function setOnNotesChanged(fn: (notes: NormalizedNote[]) => void) {
    onNotesChangedFn = fn
  }

  function setNotes(newNotes: NormalizedNote[]) {
    notes.value = newNotes
    noteIds.clear()
    for (const n of newNotes) noteIds.add(n.id)
    onNotesChangedFn?.(newNotes)
  }

  function onNoteUpdate(event: NoteUpdateEvent) {
    const updated = applyNoteUpdate(
      notes.value,
      event,
      options.getMyUserId(),
    )
    if (updated !== notes.value) {
      notes.value = updated
      if (event.type === 'deleted') {
        noteIds.delete(event.noteId)
      }
    }
  }

  async function handlePosted(editedNoteId?: string) {
    options.closePostForm()
    if (editedNoteId) {
      const adapter = options.getAdapter()
      if (!adapter) return
      try {
        const updated = await adapter.api.getNote(editedNoteId)
        notes.value = notes.value.map((n) =>
          n.id === editedNoteId
            ? updated
            : n.renoteId === editedNoteId
              ? { ...n, renote: updated }
              : n,
        )
      } catch {
        // note may have been deleted
      }
    }
  }

  async function removeNote(note: NormalizedNote) {
    const id = note.id
    const prevNotes = notes.value
    notes.value = notes.value.filter((n) => n.id !== id && n.renoteId !== id)
    noteIds.delete(id)

    if (!(await options.deleteHandler(note))) {
      notes.value = prevNotes
      noteIds.add(id)
    }
  }

  return {
    notes,
    noteIds,
    setNotes,
    setOnNotesChanged,
    onNoteUpdate,
    handlePosted,
    removeNote,
  }
}
