import { onScopeDispose, ref } from 'vue'

const STORAGE_PREFIX = 'notedeck:lastRead:'

/**
 * Per-column read marker: tracks the topmost note id the user had visible
 * at the time the column last unmounted, persisted to localStorage.
 *
 * `viewMarkerId` is read once on mount and stays sticky for this session,
 * so the divider does not jump as new notes stream in. On unmount we save
 * the current topmost id (typically `notes[0].id`) so the next mount
 * reflects "what was newest when I last left".
 */
export function useReadMarker(
  columnId: string,
  getCurrentTopmostId: () => string | null,
) {
  const key = `${STORAGE_PREFIX}${columnId}`

  const viewMarkerId = ref<string | null>(null)
  try {
    viewMarkerId.value = localStorage.getItem(key)
  } catch {
    // privacy mode or no storage available — silently disable
  }

  function persist() {
    const id = getCurrentTopmostId()
    if (!id) return
    try {
      localStorage.setItem(key, id)
    } catch {
      // storage full / privacy — ignore
    }
  }

  onScopeDispose(persist)

  // App / tab hide: save before the OS may suspend or kill the process.
  function onVisibilityChange() {
    if (document.visibilityState === 'hidden') persist()
  }
  document.addEventListener('visibilitychange', onVisibilityChange)
  onScopeDispose(() =>
    document.removeEventListener('visibilitychange', onVisibilityChange),
  )

  return { viewMarkerId }
}
