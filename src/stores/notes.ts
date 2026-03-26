import { defineStore } from 'pinia'
import { shallowRef, triggerRef } from 'vue'
import type { NormalizedNote, NoteUpdateEvent } from '@/adapters/types'

/** Maximum number of notes retained in the global store.
 *  Notes exceeding this limit are evicted in insertion order (oldest first).
 *  Keeps memory bounded during long sessions with many columns. */
const NOTE_STORE_MAX = 1500

export const useNoteStore = defineStore('notes', () => {
  const noteMap = shallowRef(new Map<string, NormalizedNote>())
  const deleteListeners = new Set<(id: string) => void>()

  /** Batch triggerRef calls into one per animation frame (streaming events fire rapidly) */
  let triggerRafId: number | null = null

  function scheduleTrigger() {
    if (triggerRafId !== null) return
    triggerRafId = requestAnimationFrame(() => {
      triggerRafId = null
      triggerRef(noteMap)
    })
  }

  /** Evict oldest entries when map exceeds NOTE_STORE_MAX. */
  function evictIfNeeded() {
    const map = noteMap.value
    if (map.size <= NOTE_STORE_MAX) return
    const excess = map.size - NOTE_STORE_MAX
    const iter = map.keys()
    for (let i = 0; i < excess; i++) {
      const key = iter.next().value
      if (key != null) map.delete(key)
    }
  }

  function put(notes: NormalizedNote[]) {
    const map = noteMap.value
    // First pass: insert all notes and renotes (delete before set to refresh insertion order)
    for (const note of notes) {
      map.delete(note.id)
      map.set(note.id, note)
      if (note.renote) {
        map.delete(note.renote.id)
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
    evictIfNeeded()
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
      let note = map.get(id)
      if (!note) continue
      // Create a new parent reference when renote changes so Vue detects the prop update
      if (note.renoteId) {
        const renote = map.get(note.renoteId)
        if (renote && renote !== note.renote) {
          note = { ...note, renote }
          map.set(id, note)
        }
      }
      result.push(note)
    }
    return result
  }

  function remove(id: string) {
    noteMap.value.delete(id)
    scheduleTrigger()
    for (const listener of deleteListeners) listener(id)
  }

  function onDelete(listener: (id: string) => void): () => void {
    deleteListeners.add(listener)
    return () => deleteListeners.delete(listener)
  }

  function applyUpdate(event: NoteUpdateEvent, myUserId: string | undefined) {
    if (event.type === 'deleted') {
      remove(event.noteId)
      return
    }

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

  return {
    noteMap,
    put,
    get,
    resolve,
    update,
    remove,
    onDelete,
    applyUpdate,
    notifyMutation,
  }
})
