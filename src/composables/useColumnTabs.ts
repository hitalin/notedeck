import { computed, nextTick, type Ref, watch } from 'vue'
import { COLUMN_ICONS, COLUMN_LABELS } from '@/columns/registry'
import type { DeckColumn } from '@/stores/deck'

export { COLUMN_ICONS, COLUMN_LABELS }

export const TL_ICONS: Record<string, string> = {
  home: 'home',
  local: 'planet',
  social: 'rocket',
  global: 'whirl',
}

export function useColumnTabs(
  columns: () => DeckColumn[],
  layout: () => string[][],
  activeColumnIndex: () => number,
  scrollContainerRef: Ref<HTMLElement | null | undefined>,
) {
  const columnMap = computed(() => {
    const map = new Map<string, DeckColumn>()
    for (const col of columns()) {
      map.set(col.id, col)
    }
    return map
  })

  const visibleGroups = computed(() =>
    layout().filter((group) => group.some((id) => columnMap.value.has(id))),
  )

  function groupPrimaryId(group: string[]): string {
    return group.find((id) => columnMap.value.has(id)) ?? group[0] ?? ''
  }

  function columnIcon(colId: string): string {
    const col = columnMap.value.get(colId)
    if (!col) return COLUMN_ICONS.timeline ?? ''
    if (col.type === 'timeline' && col.tl) {
      return TL_ICONS[col.tl] ?? COLUMN_ICONS.timeline ?? ''
    }
    return COLUMN_ICONS[col.type] ?? COLUMN_ICONS.timeline ?? ''
  }

  function columnType(colId: string): string {
    const col = columnMap.value.get(colId)
    return col?.type ?? 'timeline'
  }

  function columnAccountId(colId: string): string | null {
    const col = columnMap.value.get(colId)
    return col?.accountId ?? null
  }

  watch(activeColumnIndex, () => {
    nextTick(() => {
      if (!scrollContainerRef.value) return
      const tab = scrollContainerRef.value.children[activeColumnIndex()] as
        | HTMLElement
        | undefined
      if (tab) {
        tab.scrollIntoView({
          behavior: 'smooth',
          inline: 'center',
          block: 'nearest',
        })
      }
    })
  })

  return {
    visibleGroups,
    groupPrimaryId,
    columnType,
    columnIcon,
    columnAccountId,
  }
}
