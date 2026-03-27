import type { NormalizedNote } from '@/adapters/types'
import { usePerformanceStore } from '@/stores/performance'
import { proxyUrl } from '@/utils/imageProxy'
import { isSafeUrl } from '@/utils/url'

/**
 * Prefetch image URLs from notes that are about to enter the viewport.
 * Uses new Image() to populate the browser cache so images display instantly
 * when the virtual scroller renders the items.
 */

const prefetchedUrls = new Set<string>()

function getTrackedMax(): number {
  try {
    return usePerformanceStore().get('prefetchTrackedMax')
  } catch {
    return 500
  }
}

function evictOldest() {
  if (prefetchedUrls.size <= getTrackedMax()) return
  const iter = prefetchedUrls.values()
  // Remove oldest 100 entries to avoid frequent eviction
  for (let i = 0; i < 100; i++) {
    const v = iter.next().value
    if (v !== undefined) prefetchedUrls.delete(v)
    else break
  }
}

function resolveEffectiveNote(note: NormalizedNote): NormalizedNote {
  // Pure renote → use inner note (same logic as MkNote.effectiveNote)
  return note.renote && note.text === null ? note.renote : note
}

export function prefetchNoteImages(notes: NormalizedNote[]): void {
  for (const note of notes) {
    const effective = resolveEffectiveNote(note)
    for (const file of effective.files) {
      if (!file.type.startsWith('image/')) continue
      if (file.isSensitive) continue
      const rawUrl = file.thumbnailUrl || file.url
      if (!rawUrl || !isSafeUrl(rawUrl)) continue
      const url = proxyUrl(rawUrl) ?? rawUrl
      if (prefetchedUrls.has(url)) continue
      evictOldest()
      prefetchedUrls.add(url)
      const img = new Image()
      img.src = url
    }
  }
}
