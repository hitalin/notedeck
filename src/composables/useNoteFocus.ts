import type { ShallowRef } from 'vue'
import { computed, onUnmounted, ref, watch } from 'vue'
import type { DynamicScroller } from 'vue-virtual-scroller'
import type { NormalizedNote } from '@/adapters/types'
import { useDeckStore } from '@/stores/deck'

export type NoteAction =
  | 'next'
  | 'prev'
  | 'reply'
  | 'react'
  | 'renote'
  | 'quote'
  | 'bookmark'
  | 'open'
  | 'toggle-cw'

export interface NoteActionHandlers {
  reply: (note: NormalizedNote) => void
  reaction: (reaction: string, note: NormalizedNote) => void
  renote: (note: NormalizedNote) => void
  quote: (note: NormalizedNote) => void
  bookmark: (note: NormalizedNote) => void
}

function scrollTo(
  scroller: ShallowRef<InstanceType<typeof DynamicScroller> | null>,
  index: number,
) {
  const s = scroller.value as { scrollToItem?: (i: number) => void } | null
  s?.scrollToItem?.(index)
}

export function useNoteFocus(
  columnId: string,
  notes: ShallowRef<NormalizedNote[]>,
  scroller: ShallowRef<InstanceType<typeof DynamicScroller> | null>,
  handlers: NoteActionHandlers,
  onOpen?: (note: NormalizedNote) => void,
) {
  const deckStore = useDeckStore()
  const focusedIndex = ref(-1)

  const focusedNoteId = computed(() => {
    const idx = focusedIndex.value
    if (idx < 0 || idx >= notes.value.length) return null
    return notes.value[idx]?.id ?? null
  })

  const isActive = computed(() => deckStore.activeColumnId === columnId)

  function getFocusedNote(): NormalizedNote | null {
    const idx = focusedIndex.value
    if (idx < 0 || idx >= notes.value.length) return null
    return notes.value[idx] ?? null
  }

  function focusNext() {
    if (notes.value.length === 0) return
    const next = Math.min(focusedIndex.value + 1, notes.value.length - 1)
    focusedIndex.value = next
    scrollTo(scroller, next)
  }

  function focusPrev() {
    if (notes.value.length === 0) return
    if (focusedIndex.value <= 0) {
      focusedIndex.value = -1
      scrollTo(scroller, 0)
      return
    }
    focusedIndex.value -= 1
    scrollTo(scroller, focusedIndex.value)
  }

  function clearFocus() {
    focusedIndex.value = -1
  }

  function handleAction(e: Event) {
    if (!isActive.value) return
    const action = (e as CustomEvent<NoteAction>).detail
    switch (action) {
      case 'next':
        focusNext()
        break
      case 'prev':
        focusPrev()
        break
      case 'reply': {
        const note = getFocusedNote()
        if (note) handlers.reply(note)
        break
      }
      case 'react': {
        const note = getFocusedNote()
        if (note) {
          // Find the focused note DOM element and trigger the reaction picker
          const el = findFocusedNoteEl()
          if (el) {
            const btn = el.querySelector('.reaction-trigger') as HTMLElement
            btn?.click()
          }
        }
        break
      }
      case 'renote': {
        const note = getFocusedNote()
        if (note) handlers.renote(note)
        break
      }
      case 'quote': {
        const note = getFocusedNote()
        if (note) handlers.quote(note)
        break
      }
      case 'bookmark': {
        const note = getFocusedNote()
        if (note) handlers.bookmark(note)
        break
      }
      case 'open': {
        const note = getFocusedNote()
        if (note) onOpen?.(note)
        break
      }
      case 'toggle-cw': {
        const el = findFocusedNoteEl()
        if (el) {
          const btn = el.querySelector('.cw-toggle') as HTMLElement
          btn?.click()
        }
        break
      }
    }
  }

  function findFocusedNoteEl(): HTMLElement | null {
    const scrollerEl = scroller.value?.$el as HTMLElement | undefined
    if (!scrollerEl) return null
    return scrollerEl.querySelector(
      `[data-index="${focusedIndex.value}"] .note-root`,
    )
  }

  // Reset focus when notes change significantly (e.g., timeline reconnect)
  watch(
    () => notes.value.length,
    (newLen, oldLen) => {
      if (newLen === 0 || (oldLen > 0 && newLen < oldLen / 2)) {
        clearFocus()
      }
    },
  )

  // Reset focus when column becomes inactive
  watch(isActive, (active) => {
    if (!active) clearFocus()
  })

  document.addEventListener('nd:note-action', handleAction)
  onUnmounted(() => {
    document.removeEventListener('nd:note-action', handleAction)
  })

  return {
    focusedIndex,
    focusedNoteId,
    clearFocus,
  }
}
