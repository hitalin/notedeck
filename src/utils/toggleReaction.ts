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
  const prevReaction = note.myReaction
  const prevCounts = { ...note.reactions }

  try {
    if (prevReaction === reaction) {
      // Optimistic: remove reaction
      if ((note.reactions[reaction] ?? 0) > 1) {
        note.reactions[reaction] = (note.reactions[reaction] ?? 0) - 1
      } else {
        delete note.reactions[reaction]
      }
      note.myReaction = null

      await api.deleteReaction(note.id)
    } else {
      // Optimistic: switch or add reaction
      if (prevReaction) {
        if ((note.reactions[prevReaction] ?? 0) > 1) {
          note.reactions[prevReaction] = (note.reactions[prevReaction] ?? 0) - 1
        } else {
          delete note.reactions[prevReaction]
        }
      }
      note.reactions[reaction] = (note.reactions[reaction] ?? 0) + 1
      note.myReaction = reaction

      if (prevReaction) {
        await api.deleteReaction(note.id)
      }
      await api.createReaction(note.id, reaction)
    }
  } catch (e) {
    // Rollback to previous state on failure
    note.reactions = prevCounts
    note.myReaction = prevReaction
    throw e
  }
}
