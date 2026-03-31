import { useVirtualizer } from '@tanstack/vue-virtual'
import { useResizeObserver } from '@vueuse/core'
import type { Ref } from 'vue'
import { computed, ref, watch } from 'vue'

export interface GridGroup<T> {
  label: string
  items: T[]
}

export type VirtualRow<T> =
  | { type: 'header'; label: string; count: number }
  | { type: 'row'; items: T[] }

/**
 * Virtualizes a grouped grid layout: category headers + rows of items.
 * Items are chunked into rows based on container width and item width.
 */
export function useGridVirtualizer<T>(options: {
  groups: Ref<GridGroup<T>[]>
  scrollElement: Ref<HTMLElement | null>
  itemWidth: number
  headerHeight: number
  rowHeight: number
}) {
  const columns = ref(1)

  // Track container width to calculate column count
  useResizeObserver(options.scrollElement, (entries) => {
    const width = entries[0]?.contentRect.width ?? 0
    if (width > 0) {
      columns.value = Math.max(1, Math.floor(width / options.itemWidth))
    }
  })

  // Flatten groups into virtual rows (headers + item rows)
  const rows = computed<VirtualRow<T>[]>(() => {
    const result: VirtualRow<T>[] = []
    const cols = columns.value
    for (const group of options.groups.value) {
      result.push({
        type: 'header',
        label: group.label,
        count: group.items.length,
      })
      for (let i = 0; i < group.items.length; i += cols) {
        result.push({ type: 'row', items: group.items.slice(i, i + cols) })
      }
    }
    return result
  })

  const virtualizerOptions = computed(() => ({
    count: rows.value.length,
    getScrollElement: () => options.scrollElement.value,
    estimateSize: (index: number) => {
      const row = rows.value[index]
      return row?.type === 'header' ? options.headerHeight : options.rowHeight
    },
    overscan: 5,
  }))

  const virtualizer = useVirtualizer(virtualizerOptions)
  const virtualItems = computed(() => virtualizer.value.getVirtualItems())
  const totalSize = computed(() => virtualizer.value.getTotalSize())

  // Re-measure when columns change (row count changes)
  watch(columns, () => {
    virtualizer.value.measure()
  })

  return {
    rows,
    columns,
    virtualItems,
    totalSize,
    virtualizer,
  }
}
