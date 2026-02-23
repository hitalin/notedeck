import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import type { NormalizedNote, TimelineType } from '@/adapters/types'

export interface ServerTimeline {
  notes: NormalizedNote[]
  type: TimelineType
  isLoading: boolean
}

export const useTimelinesStore = defineStore('timelines', () => {
  const perServer = ref(new Map<string, ServerTimeline>())

  const unified = computed<NormalizedNote[]>(() => {
    const allNotes: NormalizedNote[] = []
    for (const [, tl] of perServer.value) {
      allNotes.push(...tl.notes)
    }
    return allNotes.sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    )
  })

  function initTimeline(accountId: string, type: TimelineType): void {
    perServer.value.set(accountId, {
      notes: [],
      type,
      isLoading: false,
    })
  }

  function pushNote(accountId: string, note: NormalizedNote): void {
    const tl = perServer.value.get(accountId)
    if (tl) {
      tl.notes.unshift(note)
    }
  }

  function setNotes(accountId: string, notes: NormalizedNote[]): void {
    const tl = perServer.value.get(accountId)
    if (tl) {
      tl.notes = notes
    }
  }

  function appendNotes(accountId: string, notes: NormalizedNote[]): void {
    const tl = perServer.value.get(accountId)
    if (tl) {
      tl.notes.push(...notes)
    }
  }

  function setLoading(accountId: string, loading: boolean): void {
    const tl = perServer.value.get(accountId)
    if (tl) {
      tl.isLoading = loading
    }
  }

  function clear(accountId: string): void {
    perServer.value.delete(accountId)
  }

  function clearAll(): void {
    perServer.value.clear()
  }

  return {
    perServer,
    unified,
    initTimeline,
    pushNote,
    setNotes,
    appendNotes,
    setLoading,
    clear,
    clearAll,
  }
})
