import { defineStore } from 'pinia'
import { shallowRef, triggerRef } from 'vue'
import type { NormalizedNote, NoteUpdateEvent } from '@/adapters/types'
import { useFrameScheduler } from '@/composables/useFrameScheduler'
import { usePerformanceStore } from '@/stores/performance'

export const useNoteStore = defineStore('notes', () => {
  const perfStore = usePerformanceStore()
  const { schedule } = useFrameScheduler()
  const noteMap = shallowRef(new Map<string, NormalizedNote>())
  const deleteListeners = new Set<(id: string) => void>()
  /**
   * 現在どのカラムからも参照されている ID 集合を供給する root 群。
   * 退避時に「どの root にも含まれない」ノートを優先削除し、アクティブカラムの
   * 表示継続性を保つ。各カラムは useNoteList でセットを登録／解除する。
   */
  const roots = new Set<() => Iterable<string>>()

  /** Batch triggerRef calls into one per animation frame (streaming events fire rapidly) */
  let triggerScheduled = false
  const doTrigger = () => {
    triggerScheduled = false
    triggerRef(noteMap)
  }

  function scheduleTrigger() {
    if (triggerScheduled) return
    triggerScheduled = true
    schedule(doTrigger, 'normal')
  }

  /**
   * root を登録。戻り値の関数で解除する。
   * useNoteList がカラムの可視ID集合を登録することで、退避時に
   * アクティブカラム表示中のノートが優先的に保護される。
   */
  function registerRoot(provider: () => Iterable<string>): () => void {
    roots.add(provider)
    return () => {
      roots.delete(provider)
    }
  }

  /** すべての root に含まれる ID の和集合を返す */
  function collectLiveIds(): Set<string> {
    const live = new Set<string>()
    for (const provider of roots) {
      for (const id of provider()) live.add(id)
    }
    return live
  }

  /**
   * 退避戦略:
   *   1) どの root からも参照されていないノートを古い順に削除
   *   2) それでも上限を超えるなら LRU フォールバック（古い順に削除）
   */
  function evictIfNeeded() {
    const map = noteMap.value
    const max = perfStore.get('noteStoreMax')
    if (map.size <= max) return

    const live = collectLiveIds()
    // renote 参照ノートも生存扱い（resolve() で辿られる）
    if (live.size > 0) {
      for (const id of live) {
        const note = map.get(id)
        if (note?.renoteId) live.add(note.renoteId)
      }
    }

    // 1st pass: 参照されていないノートを古い順に削除
    if (map.size > max && live.size < map.size) {
      for (const key of map.keys()) {
        if (map.size <= max) break
        if (!live.has(key)) map.delete(key)
      }
    }

    // 2nd pass: フォールバック FIFO（root が全部のノートを保護していた場合など）
    if (map.size > max) {
      const excess = map.size - max
      const iter = map.keys()
      for (let i = 0; i < excess; i++) {
        const key = iter.next().value
        if (key != null) map.delete(key)
      }
    }
  }

  /**
   * Insert notes into the global store.
   * @param skipTrigger - When true, skip scheduling triggerRef. Use this when
   *   the caller already drives reactivity via its own ref (e.g. orderedIds in useNoteList).
   */
  function put(notes: NormalizedNote[], skipTrigger = false) {
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
    if (!skipTrigger) scheduleTrigger()
  }

  function get(id: string): NormalizedNote | undefined {
    const map = noteMap.value
    const note = map.get(id)
    // Refresh insertion order so recently accessed notes survive FIFO eviction
    if (note) {
      map.delete(id)
      map.set(id, note)
    }
    return note
  }

  /** Resolve an ordered list of IDs into NormalizedNote[], with latest renote from store.
   *  Pure function — does not mutate the Map (renote syncing is handled eagerly in put()). */
  function resolve(ids: string[]): NormalizedNote[] {
    const map = noteMap.value
    const result: NormalizedNote[] = []
    for (const id of ids) {
      const note = map.get(id)
      if (!note) continue
      // Return a fresh object when renote reference is stale so Vue detects the prop update.
      // No Map mutation — keeps this function safe for use inside computed getters.
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
    registerRoot,
  }
})
