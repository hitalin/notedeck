import { shallowRef, triggerRef } from 'vue'
import type { NormalizedNote, NoteUpdateEvent } from '@/adapters/types'

const noteMap = shallowRef(new Map<string, NormalizedNote>())

function put(notes: NormalizedNote[]) {
  const map = noteMap.value
  for (const note of notes) {
    map.set(note.id, note)
    if (note.renote) {
      map.set(note.renote.id, note.renote)
    }
  }
  triggerRef(noteMap)
}

function get(id: string): NormalizedNote | undefined {
  return noteMap.value.get(id)
}

/** Resolve an ordered list of IDs into NormalizedNote[], with latest renote from store */
function resolve(ids: string[]): NormalizedNote[] {
  const map = noteMap.value
  const result: NormalizedNote[] = []
  for (const id of ids) {
    const note = map.get(id)
    if (!note) continue
    if (note.renoteId) {
      const renote = map.get(note.renoteId)
      if (renote && renote !== note.renote) {
        result.push({ ...note, renote })
        continue
      }
    }
    result.push(note)
  }
  return result
}

function applyUpdate(event: NoteUpdateEvent, myUserId: string | undefined) {
  if (event.type === 'deleted') return

  const note = noteMap.value.get(event.noteId)
  if (!note) return

  switch (event.type) {
    case 'reacted': {
      const reaction = event.body.reaction
      if (!reaction || event.body.userId === myUserId) return
      let newReactionEmojis = note.reactionEmojis
      if (event.body.emoji) {
        // Strip colons to match API convention (reactionEmojis keys have no colons)
        const shortcode =
          reaction.startsWith(':') && reaction.endsWith(':')
            ? reaction.slice(1, -1)
            : reaction
        const emojiUrl =
          typeof event.body.emoji === 'string'
            ? event.body.emoji
            : event.body.emoji.url
        newReactionEmojis = { ...note.reactionEmojis, [shortcode]: emojiUrl }
      }
      noteMap.value.set(event.noteId, {
        ...note,
        reactions: {
          ...note.reactions,
          [reaction]: (note.reactions[reaction] ?? 0) + 1,
        },
        reactionEmojis: newReactionEmojis,
      })
      triggerRef(noteMap)
      break
    }
    case 'unreacted': {
      const reaction = event.body.reaction
      if (!reaction || event.body.userId === myUserId) return
      const newReactions = { ...note.reactions }
      const count = (newReactions[reaction] ?? 0) - 1
      if (count <= 0) delete newReactions[reaction]
      else newReactions[reaction] = count
      noteMap.value.set(event.noteId, { ...note, reactions: newReactions })
      triggerRef(noteMap)
      break
    }
    case 'pollVoted': {
      const choice = event.body.choice
      if (choice == null || !note.poll) return
      const newChoices = note.poll.choices.map((c, i) =>
        i === choice ? { ...c, votes: c.votes + 1 } : c,
      )
      noteMap.value.set(event.noteId, {
        ...note,
        poll: { ...note.poll, choices: newChoices },
      })
      triggerRef(noteMap)
      break
    }
  }
}

/** Update a single note in the store */
function update(id: string, note: NormalizedNote) {
  noteMap.value.set(id, note)
  triggerRef(noteMap)
}

/** Trigger reactivity after direct note mutation (e.g. toggleReaction) */
function notifyMutation() {
  triggerRef(noteMap)
}

export const noteStore = {
  noteMap,
  put,
  get,
  resolve,
  update,
  applyUpdate,
  notifyMutation,
}
