import { computed, shallowRef } from 'vue'
import { invoke } from '@tauri-apps/api/core'
import type {
  NormalizedNote,
  NoteUpdateEvent,
  ServerAdapter,
} from '@/adapters/types'
import type { MfmToken } from '@/utils/mfm'
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
    batchParseMfm(newNotes)
  }

  function batchParseMfm(noteList: NormalizedNote[]) {
    const texts: string[] = []
    const mapping: { id: string; field: '_parsedText' | '_parsedCw' }[] = []
    for (const note of noteList) {
      const effective = note.renote && !note.text ? note.renote : note
      if (effective.text && !effective._parsedText) {
        texts.push(effective.text)
        mapping.push({ id: effective.id, field: '_parsedText' })
      }
      if (effective.cw && !effective._parsedCw) {
        texts.push(effective.cw)
        mapping.push({ id: effective.id, field: '_parsedCw' })
      }
    }
    if (texts.length === 0) return

    const schedule = window.requestIdleCallback ?? ((cb: () => void) => setTimeout(cb, 0))
    schedule(async () => {
      try {
        const results = await invoke<MfmToken[][]>('parse_mfm_batch', { texts })
        for (let i = 0; i < results.length; i++) {
          const entry = mapping[i]!
          const note = noteStore.get(entry.id)
          if (note && !note[entry.field]) {
            noteStore.update(entry.id, { ...note, [entry.field]: results[i] })
          }
        }
      } catch { /* TS parser fallback handles this */ }
    })
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
