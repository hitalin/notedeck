import type { NormalizedNote, NoteUpdateEvent } from '@/adapters/types'

/**
 * Apply a note update event (reaction, unreaction, deletion, poll vote)
 * to a notes array. Returns a new array if any note was modified,
 * or the same array reference if no changes were made.
 */
export function applyNoteUpdate(
  notes: NormalizedNote[],
  event: NoteUpdateEvent,
  myUserId: string | undefined,
): NormalizedNote[] {
  switch (event.type) {
    case 'reacted': {
      const reaction = event.body.reaction
      if (!reaction) return notes
      if (event.body.userId === myUserId) return notes
      return mapTarget(notes, event.noteId, (target) => {
        const newReactions = {
          ...target.reactions,
          [reaction]: (target.reactions[reaction] ?? 0) + 1,
        }
        const newEmojis = event.body.emoji
          ? { ...target.reactionEmojis, [reaction]: event.body.emoji }
          : target.reactionEmojis
        return { ...target, reactions: newReactions, reactionEmojis: newEmojis }
      })
    }
    case 'unreacted': {
      const reaction = event.body.reaction
      if (!reaction) return notes
      if (event.body.userId === myUserId) return notes
      return mapTarget(notes, event.noteId, (target) => {
        const newReactions = { ...target.reactions }
        const count = (newReactions[reaction] ?? 0) - 1
        if (count <= 0) delete newReactions[reaction]
        else newReactions[reaction] = count
        return { ...target, reactions: newReactions }
      })
    }
    case 'deleted':
      return notes.filter(
        (n) => n.id !== event.noteId && n.renoteId !== event.noteId,
      )
    case 'pollVoted': {
      const choice = event.body.choice
      if (choice == null) return notes
      return mapTarget(notes, event.noteId, (target) => {
        if (!target.poll) return target
        const newChoices = target.poll.choices.map((c, i) =>
          i === choice ? { ...c, votes: c.votes + 1 } : c,
        )
        return { ...target, poll: { ...target.poll, choices: newChoices } }
      })
    }
    default:
      return notes
  }
}

function mapTarget(
  notes: NormalizedNote[],
  noteId: string,
  updater: (target: NormalizedNote) => NormalizedNote,
): NormalizedNote[] {
  let changed = false
  const result = notes.map((n) => {
    if (n.id === noteId) {
      changed = true
      return updater(n)
    }
    if (n.renoteId === noteId && n.renote) {
      changed = true
      return { ...n, renote: updater(n.renote) }
    }
    return n
  })
  return changed ? result : notes
}
