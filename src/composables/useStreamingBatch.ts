import { nextTick, ref, shallowRef } from 'vue'
import type { DynamicScroller } from 'vue-virtual-scroller'
import type { NormalizedNote } from '@/adapters/types'

export interface UseStreamingBatchOptions {
  notes: { value: NormalizedNote[] }
  noteIds: Set<string>
  scroller: { value: InstanceType<typeof DynamicScroller> | null }
  maxNotes?: number
}

export function useStreamingBatch(options: UseStreamingBatchOptions) {
  const MAX_NOTES = options.maxNotes ?? 500
  const pendingNotes = shallowRef<NormalizedNote[]>([])
  const isAtTop = ref(true)

  let rafBuffer: NormalizedNote[] = []
  let rafId: number | null = null

  let forceUpdateTimer: ReturnType<typeof setTimeout> | null = null

  function scheduleForceUpdate() {
    if (forceUpdateTimer) return
    forceUpdateTimer = setTimeout(() => {
      forceUpdateTimer = null
      nextTick(() => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ;(options.scroller.value as any)?.forceUpdate()
      })
    }, 500)
  }

  function flushRafBuffer() {
    rafId = null
    if (rafBuffer.length === 0) return
    const batch = rafBuffer
    rafBuffer = []
    if (isAtTop.value) {
      for (const n of batch) options.noteIds.add(n.id)
      const merged = [...batch, ...options.notes.value]
      options.notes.value =
        merged.length > MAX_NOTES ? merged.slice(0, MAX_NOTES) : merged
      scheduleForceUpdate()
    } else {
      const merged = [...batch, ...pendingNotes.value]
      pendingNotes.value =
        merged.length > MAX_NOTES ? merged.slice(0, MAX_NOTES) : merged
    }
  }

  function enqueueNote(note: NormalizedNote) {
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
    for (const n of newNotes) options.noteIds.add(n.id)
    const merged = [...newNotes, ...options.notes.value]
    options.notes.value =
      merged.length > MAX_NOTES ? merged.slice(0, MAX_NOTES) : merged
    pendingNotes.value = []
    scheduleForceUpdate()
  }

  function handleScroll() {
    const el = options.scroller.value?.$el as HTMLElement | undefined
    if (el) {
      isAtTop.value = el.scrollTop <= 10
      if (isAtTop.value && pendingNotes.value.length > 0) {
        flushPending()
      }
    }
  }

  function scrollToTop(smooth = false) {
    const el = options.scroller.value?.$el as HTMLElement | undefined
    if (el) el.scrollTo({ top: 0, behavior: smooth ? 'smooth' : 'instant' })
    isAtTop.value = true
    flushPending()
  }

  function resetBatch() {
    rafBuffer = []
    if (rafId !== null) {
      cancelAnimationFrame(rafId)
      rafId = null
    }
    if (forceUpdateTimer) {
      clearTimeout(forceUpdateTimer)
      forceUpdateTimer = null
    }
    pendingNotes.value = []
    isAtTop.value = true
  }

  return {
    pendingNotes,
    isAtTop,
    enqueueNote,
    flushPending,
    handleScroll,
    scrollToTop,
    resetBatch,
  }
}
