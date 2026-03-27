import { onScopeDispose, ref, shallowRef } from 'vue'
import type { NormalizedNote } from '@/adapters/types'
import { usePerformanceStore } from '@/stores/performance'
import { insertIntoSorted } from '@/utils/sortNotes'

export interface UseStreamingBatchOptions {
  notes: { value: NormalizedNote[] }
  noteIds: Set<string>
  scroller: { value: HTMLElement | null }
  maxNotes?: number
  onNewNotes?: (notes: NormalizedNote[]) => void
}

export function useStreamingBatch(options: UseStreamingBatchOptions) {
  const perfStore = usePerformanceStore()
  const MAX_NOTES = options.maxNotes ?? perfStore.get('noteListMax')
  const pendingNotes = shallowRef<NormalizedNote[]>([])
  const isAtTop = ref(true)
  /** Set of note IDs currently playing the slide-in animation */
  const animatingIds = shallowRef<ReadonlySet<string>>(new Set())
  const _animTimers = new Set<ReturnType<typeof setTimeout>>()
  let rafBuffer: NormalizedNote[] = []
  let rafId: number | null = null
  let _paused = false

  function enableAnimation(batchIds: string[]) {
    if (batchIds.length === 0) return
    const next = new Set(animatingIds.value)
    for (const id of batchIds) next.add(id)
    animatingIds.value = next

    const timer = setTimeout(() => {
      _animTimers.delete(timer)
      const after = new Set(animatingIds.value)
      for (const id of batchIds) after.delete(id)
      animatingIds.value = after
    }, 350)
    _animTimers.add(timer)
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
      enableAnimation(batch.map((n) => n.id))
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
    enableAnimation(newNotes.map((n) => n.id))
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
    for (const t of _animTimers) clearTimeout(t)
    _animTimers.clear()
    animatingIds.value = new Set()
    pendingNotes.value = []
    isAtTop.value = true
  }

  onScopeDispose(resetBatch)

  return {
    pendingNotes,
    isAtTop,
    animatingIds,
    enqueueNote,
    flushPending,
    handleScroll,
    scrollToTop,
    removePending,
    resetBatch,
    setPaused,
  }
}
