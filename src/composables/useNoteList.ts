import { invoke } from '@tauri-apps/api/core'
import { computed, onScopeDispose, shallowRef } from 'vue'
import type {
  NormalizedNote,
  NoteUpdateEvent,
  ServerAdapter,
} from '@/adapters/types'
import { useNoteStore } from '@/stores/notes'

export interface UseNoteListOptions {
  getMyUserId: () => string | undefined
  getAdapter: () => ServerAdapter | null
  deleteHandler: (note: NormalizedNote) => Promise<boolean>
  closePostForm: () => void
  onNotesChanged?: (notes: NormalizedNote[]) => void
}

export function useNoteList(options: UseNoteListOptions) {
  const noteStore = useNoteStore()
  const orderedIds = shallowRef<string[]>([])
  const noteIds = new Set<string>()
  let onNotesChangedFn = options.onNotesChanged

  // Listen for global note deletions so ALL columns clean up their orderedIds
  const unsubDelete = noteStore.onDelete((id) => {
    if (noteIds.has(id)) {
      orderedIds.value = orderedIds.value.filter((oid) => oid !== id)
      noteIds.delete(id)
    }
  })
  onScopeDispose(unsubDelete)

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

  /**
   * Update notes without changing list structure.
   * If the new notes have the same IDs in the same order, only update
   * note content in the store (avoids list re-render).
   * Returns true if a lightweight update was performed.
   */
  function mergeIfSameList(newNotes: NormalizedNote[]): boolean {
    const currentIds = orderedIds.value
    if (
      currentIds.length === newNotes.length &&
      currentIds.every((id, i) => id === newNotes[i]?.id)
    ) {
      noteStore.put(newNotes)
      return true
    }
    return false
  }

  function onNoteUpdate(event: NoteUpdateEvent) {
    if (event.type === 'deleted') {
      // noteStore.remove() triggers global onDelete listeners,
      // which clean up orderedIds/noteIds in ALL columns
      noteStore.remove(event.noteId)
      invoke('api_delete_cached_note', { noteId: event.noteId }).catch(() => {})
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
    notes.value = notes.value.filter((n) => n.id !== id && n.renoteId !== id)

    if (await options.deleteHandler(note)) {
      noteStore.remove(id)
      invoke('api_delete_cached_note', { noteId: id }).catch(() => {})
    } else {
      orderedIds.value = prevIds
      noteIds.clear()
      for (const nid of prevIds) noteIds.add(nid)
    }
  }

  return {
    notes,
    noteIds,
    setNotes,
    mergeIfSameList,
    setOnNotesChanged,
    onNoteUpdate,
    handlePosted,
    removeNote,
  }
}
