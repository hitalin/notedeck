import type { NormalizedNote } from '@/adapters/types'

interface ReactionApi {
  createReaction(noteId: string, reaction: string): Promise<void>
  deleteReaction(noteId: string): Promise<void>
}

export async function toggleReaction(
  api: ReactionApi,
  note: NormalizedNote,
  reaction: string,
): Promise<void> {
  if (note.myReaction === reaction) {
    await api.deleteReaction(note.id)
    if ((note.reactions[reaction] ?? 0) > 1) {
      note.reactions[reaction]!--
    } else {
      delete note.reactions[reaction]
    }
    note.myReaction = null
  } else {
    if (note.myReaction) {
      await api.deleteReaction(note.id)
      const prev = note.myReaction
      if ((note.reactions[prev] ?? 0) > 1) {
        note.reactions[prev]!--
      } else {
        delete note.reactions[prev]
      }
    }
    await api.createReaction(note.id, reaction)
    note.reactions[reaction] = (note.reactions[reaction] ?? 0) + 1
    note.myReaction = reaction
  }
}
