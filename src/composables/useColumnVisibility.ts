import {
  computed,
  type InjectionKey,
  inject,
  provide,
  type Ref,
  reactive,
} from 'vue'
import { usePerformanceStore } from '@/stores/performance'

type VisibilityMap = Map<string, boolean>

const COLUMN_VISIBILITY_KEY: InjectionKey<VisibilityMap> =
  Symbol('columnVisibility')

/** Delay before deactivating an off-screen column (ms). */

type MountedMap = Map<string, boolean>

const COLUMN_MOUNTED_KEY: InjectionKey<MountedMap> = Symbol('columnMounted')

/**
 * Live budget: tracks which columns are allowed to have active streaming.
 * Only the closest `maxLiveColumns` visible columns (by distance from active)
 * are considered "live". Others are "suspended" (mounted but paused).
 */
type LiveMap = Map<string, boolean>

const COLUMN_LIVE_KEY: InjectionKey<LiveMap> = Symbol('columnLive')

/** Provide column visibility tracking from DeckLayout. */
export function provideColumnVisibility() {
  const perfStore = usePerformanceStore()
  const map: VisibilityMap = reactive(new Map())
  const mounted: MountedMap = reactive(new Map())
  const live: LiveMap = reactive(new Map())
  provide(COLUMN_VISIBILITY_KEY, map)
  provide(COLUMN_MOUNTED_KEY, mounted)
  provide(COLUMN_LIVE_KEY, live)

  // Track pending unload timers per column
  const unloadTimers = new Map<string, ReturnType<typeof setTimeout>>()
  // Track observed elements per column so we can unobserve on cleanup
  const observedElements = new Map<string, Element>()

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
                  live.delete(colId)
                }
              }, perfStore.get('columnUnloadDelay'))
              unloadTimers.set(colId, timer)
            }
          }
        }
      },
      // rootMargin で横方向に 10% 余裕を持たせ、端ピクセルの判定不安定を吸収
      { root: container.value, threshold: 0, rootMargin: '0px 10%' },
    )
  }

  function observe(el: Element, options?: { initialMounted?: boolean }) {
    observer?.observe(el)
    const colId = (el as HTMLElement).dataset.columnId
    if (!colId) return
    observedElements.set(colId, el)
    if (!mounted.has(colId)) {
      mounted.set(colId, options?.initialMounted ?? false)
    }
  }

  function cleanup(colId: string) {
    const el = observedElements.get(colId)
    if (el) {
      observer?.unobserve(el)
      observedElements.delete(colId)
    }
    const timer = unloadTimers.get(colId)
    if (timer != null) {
      clearTimeout(timer)
      unloadTimers.delete(colId)
    }
    map.delete(colId)
    mounted.delete(colId)
    live.delete(colId)
  }

  function disconnect() {
    observer?.disconnect()
    observer = null
    observedElements.clear()
    // Clear all pending timers
    for (const timer of unloadTimers.values()) {
      clearTimeout(timer)
    }
    unloadTimers.clear()
  }

  /** Check if a column should have its DOM mounted (for use in the providing component). */
  function isColumnMounted(columnId: string): boolean {
    return mounted.get(columnId) ?? false
  }

  /**
   * Recompute which columns are "live" (streaming allowed) based on the
   * maxLiveColumns budget. Called by DeckColumnsArea when the active column
   * or visibility changes.
   *
   * @param orderedColumnIds - All column IDs in display order (left to right)
   * @param activeColumnId - The currently active column
   */
  function updateLiveBudget(
    orderedColumnIds: string[],
    activeColumnId: string | null,
  ): void {
    const maxLive = perfStore.get('maxLiveColumns')
    const activeIndex = activeColumnId
      ? orderedColumnIds.indexOf(activeColumnId)
      : 0

    // Collect visible+mounted columns with their distance from active
    const candidates: { id: string; distance: number }[] = []
    for (let i = 0; i < orderedColumnIds.length; i++) {
      const id = orderedColumnIds[i]
      if (id && mounted.get(id)) {
        candidates.push({ id, distance: Math.abs(i - activeIndex) })
      }
    }

    // Sort by distance (closest first), take maxLive
    candidates.sort((a, b) => a.distance - b.distance)
    const liveSet = new Set(candidates.slice(0, maxLive).map((c) => c.id))

    // Update live map
    for (const id of orderedColumnIds) {
      if (liveSet.has(id)) {
        live.set(id, true)
      } else if (live.has(id)) {
        live.set(id, false)
      }
    }
  }

  return {
    setup,
    observe,
    cleanup,
    disconnect,
    isColumnMounted,
    updateLiveBudget,
  }
}

/** Inject column visibility state. Returns true when column is visible or unknown. */
export function useColumnVisible(columnId: string) {
  const map = inject(COLUMN_VISIBILITY_KEY, null)
  const liveMap = inject(COLUMN_LIVE_KEY, null)
  const isVisible = computed(() => map?.get(columnId) ?? true)
  const isLive = computed(() => liveMap?.get(columnId) ?? true)
  return { isVisible, isLive }
}
