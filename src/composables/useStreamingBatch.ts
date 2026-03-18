import { nextTick, onScopeDispose, ref, shallowRef } from 'vue'
import type { NormalizedNote } from '@/adapters/types'
import { NOTE_LIST_MAX } from '@/composables/useNoteList'
import { insertIntoSorted } from '@/utils/sortNotes'

export interface UseStreamingBatchOptions {
  notes: { value: NormalizedNote[] }
  noteIds: Set<string>
  scroller: { value: HTMLElement | null }
  maxNotes?: number
  onNewNotes?: (notes: NormalizedNote[]) => void
}

export function useStreamingBatch(options: UseStreamingBatchOptions) {
  const MAX_NOTES = options.maxNotes ?? NOTE_LIST_MAX
  const pendingNotes = shallowRef<NormalizedNote[]>([])
  const isAtTop = ref(true)
  /** True only during the render cycle when streaming notes are inserted */
  const animateEnter = ref(false)
  let rafBuffer: NormalizedNote[] = []
  let rafId: number | null = null
  let _paused = false

  function enableAnimation() {
    animateEnter.value = true
    nextTick(() => {
      animateEnter.value = false
    })
  }

  function syncNoteIds() {
    options.noteIds.clear()
    for (const n of options.notes.value) options.noteIds.add(n.id)
  }

  function setPaused(paused: boolean) {
    _paused = paused
  }

  function flushRafBuffer() {
    rafId = null
    if (rafBuffer.length === 0) return
    const batch = rafBuffer
    rafBuffer = []
    if (isAtTop.value) {
      enableAnimation()
      for (const n of batch) options.noteIds.add(n.id)
      const merged = insertIntoSorted(options.notes.value, batch)
      options.notes.value =
        merged.length > MAX_NOTES ? merged.slice(0, MAX_NOTES) : merged
      if (merged.length > MAX_NOTES) syncNoteIds()
      options.onNewNotes?.(batch)
    } else {
      const merged = insertIntoSorted(pendingNotes.value, batch)
      pendingNotes.value =
        merged.length > MAX_NOTES ? merged.slice(0, MAX_NOTES) : merged
    }
  }

  function enqueueNote(note: NormalizedNote) {
    if (_paused) return
    rafBuffer.push(note)
    if (rafId === null) {
      rafId = requestAnimationFrame(flushRafBuffer)
    }
  }

  function flushPending() {
    if (pendingNotes.value.length === 0) return
    const newNotes = pendingNotes.value.filter(
      (n) => !options.noteIds.has(n.id),
    )
    if (newNotes.length === 0) {
      pendingNotes.value = []
      return
    }
    enableAnimation()
    for (const n of newNotes) options.noteIds.add(n.id)
    const merged = insertIntoSorted(options.notes.value, newNotes)
    options.notes.value =
      merged.length > MAX_NOTES ? merged.slice(0, MAX_NOTES) : merged
    if (merged.length > MAX_NOTES) syncNoteIds()
    pendingNotes.value = []
  }

  function handleScroll() {
    const el = options.scroller.value ?? undefined
    if (el) {
      isAtTop.value = el.scrollTop <= 10
      if (isAtTop.value && pendingNotes.value.length > 0) {
        flushPending()
      }
    }
  }

  function scrollToTop() {
    isAtTop.value = true
    flushPending()
    const el = options.scroller.value ?? undefined
    if (el) el.scrollTop = 0
  }

  function removePending(noteId: string) {
    rafBuffer = rafBuffer.filter((n) => n.id !== noteId)
    if (pendingNotes.value.some((n) => n.id === noteId)) {
      pendingNotes.value = pendingNotes.value.filter((n) => n.id !== noteId)
    }
  }

  function resetBatch() {
    rafBuffer = []
    if (rafId !== null) {
      cancelAnimationFrame(rafId)
      rafId = null
    }
    pendingNotes.value = []
    isAtTop.value = true
  }

  onScopeDispose(resetBatch)

  return {
    pendingNotes,
    isAtTop,
    animateEnter,
    enqueueNote,
    flushPending,
    handleScroll,
    scrollToTop,
    removePending,
    resetBatch,
    setPaused,
  }
}
