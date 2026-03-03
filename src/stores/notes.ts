import { shallowRef, triggerRef } from 'vue'
import type { NormalizedNote, NoteUpdateEvent } from '@/adapters/types'

const noteMap = shallowRef(new Map<string, NormalizedNote>())

/** Batch triggerRef calls into one per animation frame (streaming events fire rapidly) */
let triggerRafId: number | null = null

function scheduleTrigger() {
  if (triggerRafId !== null) return
  triggerRafId = requestAnimationFrame(() => {
    triggerRafId = null
    triggerRef(noteMap)
  })
}

function put(notes: NormalizedNote[]) {
  const map = noteMap.value
  // First pass: insert all notes and renotes
  for (const note of notes) {
    map.set(note.id, note)
    if (note.renote) {
      map.set(note.renote.id, note.renote)
    }
  }
  // Second pass: eagerly sync renote references so resolve() avoids spread
  for (const note of notes) {
    if (note.renoteId) {
      const latest = map.get(note.renoteId)
      if (latest && note.renote !== latest) {
        note.renote = latest
      }
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
    // Sync renote reference in place (shallowRef: no deep reactivity overhead)
    if (note.renoteId) {
      const renote = map.get(note.renoteId)
      if (renote && renote !== note.renote) {
        note.renote = renote
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
      scheduleTrigger()
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
      scheduleTrigger()
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
      scheduleTrigger()
      break
    }
  }
}

/** Update a single note in the store (batched trigger for streaming perf) */
function update(id: string, note: NormalizedNote) {
  noteMap.value.set(id, note)
  scheduleTrigger()
}

/** Trigger reactivity after direct note mutation (e.g. toggleReaction) */
function notifyMutation() {
  scheduleTrigger()
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
