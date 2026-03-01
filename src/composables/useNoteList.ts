import { computed, shallowRef } from 'vue'
import type {
  NormalizedNote,
  NoteUpdateEvent,
  ServerAdapter,
} from '@/adapters/types'
import { noteStore } from '@/stores/notes'

export interface UseNoteListOptions {
  getMyUserId: () => string | undefined
  getAdapter: () => ServerAdapter | null
  deleteHandler: (note: NormalizedNote) => Promise<boolean>
  closePostForm: () => void
  onNotesChanged?: (notes: NormalizedNote[]) => void
}

export function useNoteList(options: UseNoteListOptions) {
  const orderedIds = shallowRef<string[]>([])
  const noteIds = new Set<string>()
  let onNotesChangedFn = options.onNotesChanged

  const notes = computed({
    get: () => noteStore.resolve(orderedIds.value),
    set: (newNotes: NormalizedNote[]) => {
      noteStore.put(newNotes)
      orderedIds.value = newNotes.map((n) => n.id)
      noteIds.clear()
      for (const n of newNotes) noteIds.add(n.id)
    },
  })

  function setOnNotesChanged(fn: (notes: NormalizedNote[]) => void) {
    onNotesChangedFn = fn
  }

  function setNotes(newNotes: NormalizedNote[]) {
    notes.value = newNotes
    onNotesChangedFn?.(newNotes)
  }

  function onNoteUpdate(event: NoteUpdateEvent) {
    if (event.type === 'deleted') {
      if (noteIds.has(event.noteId)) {
        orderedIds.value = orderedIds.value.filter(
          (id) => id !== event.noteId,
        )
        noteIds.delete(event.noteId)
      }
      return
    }
    noteStore.applyUpdate(event, options.getMyUserId())
  }

  async function handlePosted(editedNoteId?: string) {
    options.closePostForm()
    if (editedNoteId) {
      const adapter = options.getAdapter()
      if (!adapter) return
      try {
        const updated = await adapter.api.getNote(editedNoteId)
        noteStore.put([updated])
      } catch {
        // note may have been deleted
      }
    }
  }

  async function removeNote(note: NormalizedNote) {
    const id = note.id
    const prevIds = orderedIds.value
    notes.value = notes.value.filter(
      (n) => n.id !== id && n.renoteId !== id,
    )

    if (!(await options.deleteHandler(note))) {
      orderedIds.value = prevIds
      noteIds.clear()
      for (const nid of prevIds) noteIds.add(nid)
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
