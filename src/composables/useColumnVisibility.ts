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

/** Provide column visibility tracking from DeckLayout. */
export function provideColumnVisibility() {
  const map: VisibilityMap = reactive(new Map())
  provide(COLUMN_VISIBILITY_KEY, map)

  let observer: IntersectionObserver | null = null

  function setup(container: Ref<HTMLElement | null>) {
    observer = new IntersectionObserver(
      (entries) => {
        if (document.hidden) return
        for (const entry of entries) {
          const colId = (entry.target as HTMLElement).dataset.columnId
          if (colId) map.set(colId, entry.isIntersecting)
        }
      },
      { root: container.value, threshold: 0 },
    )
  }

  function observe(el: Element) {
    observer?.observe(el)
  }

  function disconnect() {
    observer?.disconnect()
    observer = null
  }

  return { setup, observe, disconnect }
}

/** Inject column visibility state. Returns true when column is visible or unknown. */
export function useColumnVisible(columnId: string) {
  const map = inject(COLUMN_VISIBILITY_KEY, null)
  const isVisible = computed(() => map?.get(columnId) ?? true)
  return { isVisible }
}
