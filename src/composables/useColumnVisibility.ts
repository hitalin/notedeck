import {
  computed,
  type InjectionKey,
  inject,
  provide,
  type Ref,
  reactive,
} from 'vue'

type VisibilityMap = Map<string, boolean>

const COLUMN_VISIBILITY_KEY: InjectionKey<VisibilityMap> =
  Symbol('columnVisibility')

/** Delay before deactivating an off-screen column (ms).
 *  With KeepAlive, deactivated columns are cached and restored instantly. */
const UNLOAD_DELAY = 8_000

type MountedMap = Map<string, boolean>

const COLUMN_MOUNTED_KEY: InjectionKey<MountedMap> = Symbol('columnMounted')

/** Provide column visibility tracking from DeckLayout. */
export function provideColumnVisibility() {
  const map: VisibilityMap = reactive(new Map())
  const mounted: MountedMap = reactive(new Map())
  provide(COLUMN_VISIBILITY_KEY, map)
  provide(COLUMN_MOUNTED_KEY, mounted)

  // Track pending unload timers per column
  const unloadTimers = new Map<string, ReturnType<typeof setTimeout>>()

  let observer: IntersectionObserver | null = null

  function setup(container: Ref<HTMLElement | null>) {
    observer = new IntersectionObserver(
      (entries) => {
        if (document.hidden) return
        for (const entry of entries) {
          const colId = (entry.target as HTMLElement).dataset.columnId
          if (!colId) continue

          map.set(colId, entry.isIntersecting)

          if (entry.isIntersecting) {
            // Visible → mount immediately, cancel any pending unload
            const timer = unloadTimers.get(colId)
            if (timer != null) {
              clearTimeout(timer)
              unloadTimers.delete(colId)
            }
            mounted.set(colId, true)
          } else {
            // Not visible → schedule unload after delay
            if (!unloadTimers.has(colId)) {
              const timer = setTimeout(() => {
                unloadTimers.delete(colId)
                // Only unmount if still not visible
                if (!map.get(colId)) {
                  mounted.set(colId, false)
                }
              }, UNLOAD_DELAY)
              unloadTimers.set(colId, timer)
            }
          }
        }
      },
      { root: container.value, threshold: 0 },
    )
  }

  function observe(el: Element) {
    observer?.observe(el)
    // New columns start mounted
    const colId = (el as HTMLElement).dataset.columnId
    if (colId && !mounted.has(colId)) {
      mounted.set(colId, true)
    }
  }

  function disconnect() {
    observer?.disconnect()
    observer = null
    // Clear all pending timers
    for (const timer of unloadTimers.values()) {
      clearTimeout(timer)
    }
    unloadTimers.clear()
  }

  /** Check if a column should have its DOM mounted (for use in the providing component). */
  function isColumnMounted(columnId: string): boolean {
    return mounted.get(columnId) ?? true
  }

  return { setup, observe, disconnect, isColumnMounted }
}

/** Inject column visibility state. Returns true when column is visible or unknown. */
export function useColumnVisible(columnId: string) {
  const map = inject(COLUMN_VISIBILITY_KEY, null)
  const isVisible = computed(() => map?.get(columnId) ?? true)
  return { isVisible }
}
