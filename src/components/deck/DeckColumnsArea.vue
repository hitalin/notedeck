<script setup lang="ts">
import type { Component } from 'vue'
import {
  computed,
  defineAsyncComponent,
  onMounted,
  onUnmounted,
  ref,
  useCssModule,
  watch,
} from 'vue'
import { useColumnDrag } from '@/composables/useColumnDrag'
import { useColumnResize } from '@/composables/useColumnResize'
import { provideColumnVisibility } from '@/composables/useColumnVisibility'
import { useDeckStore } from '@/stores/deck'
import { useIsCompactLayout } from '@/stores/ui'

const emit = defineEmits<{
  'active-column-index': [index: number]
}>()

const COLUMN_COMPONENTS: Record<string, Component> = {
  timeline: defineAsyncComponent(() => import('./DeckTimelineColumn.vue')),
  list: defineAsyncComponent(() => import('./DeckListColumn.vue')),
  antenna: defineAsyncComponent(() => import('./DeckAntennaColumn.vue')),
  notifications: defineAsyncComponent(
    () => import('./DeckNotificationColumn.vue'),
  ),
  search: defineAsyncComponent(() => import('./DeckSearchColumn.vue')),
  favorites: defineAsyncComponent(() => import('./DeckFavoritesColumn.vue')),
  clip: defineAsyncComponent(() => import('./DeckClipColumn.vue')),
  channel: defineAsyncComponent(() => import('./DeckChannelColumn.vue')),
  user: defineAsyncComponent(() => import('./DeckUserColumn.vue')),
  mentions: defineAsyncComponent(() => import('./DeckMentionsColumn.vue')),
  specified: defineAsyncComponent(() => import('./DeckSpecifiedColumn.vue')),
  chat: defineAsyncComponent(() => import('./DeckChatColumn.vue')),
  widget: defineAsyncComponent(() => import('./DeckWidgetColumn.vue')),
  aiscript: defineAsyncComponent(() => import('./DeckAiScriptColumn.vue')),
  play: defineAsyncComponent(() => import('./DeckPlayColumn.vue')),
  page: defineAsyncComponent(() => import('./DeckPageColumn.vue')),
  ai: defineAsyncComponent(() => import('./DeckAiColumn.vue')),
  drive: defineAsyncComponent(() => import('./DeckDriveColumn.vue')),
  announcements: defineAsyncComponent(
    () => import('./DeckAnnouncementsColumn.vue'),
  ),
  gallery: defineAsyncComponent(() => import('./DeckGalleryColumn.vue')),
  explore: defineAsyncComponent(() => import('./DeckExploreColumn.vue')),
  followRequests: defineAsyncComponent(
    () => import('./DeckFollowRequestsColumn.vue'),
  ),
  achievements: defineAsyncComponent(
    () => import('./DeckAchievementsColumn.vue'),
  ),
  apiConsole: defineAsyncComponent(() => import('./DeckApiConsoleColumn.vue')),
  apiDocs: defineAsyncComponent(() => import('./DeckApiDocsColumn.vue')),
  lookup: defineAsyncComponent(() => import('./DeckLookupColumn.vue')),
  serverInfo: defineAsyncComponent(() => import('./DeckServerInfoColumn.vue')),
  ads: defineAsyncComponent(() => import('./DeckAdsColumn.vue')),
  aboutMisskey: defineAsyncComponent(
    () => import('./DeckAboutMisskeyColumn.vue'),
  ),
  emoji: defineAsyncComponent(() => import('./DeckEmojiColumn.vue')),
}

// Preload chunks for column types the user actually has configured
const COLUMN_PRELOADERS: Partial<Record<string, () => Promise<unknown>>> = {
  timeline: () => import('./DeckTimelineColumn.vue'),
  notifications: () => import('./DeckNotificationColumn.vue'),
  search: () => import('./DeckSearchColumn.vue'),
  list: () => import('./DeckListColumn.vue'),
  antenna: () => import('./DeckAntennaColumn.vue'),
  favorites: () => import('./DeckFavoritesColumn.vue'),
  mentions: () => import('./DeckMentionsColumn.vue'),
  channel: () => import('./DeckChannelColumn.vue'),
  user: () => import('./DeckUserColumn.vue'),
  chat: () => import('./DeckChatColumn.vue'),
}

const $style = useCssModule()
const deckStore = useDeckStore()

// Column drag & drop (CSS Module class names are passed as selectors)
const columnDrag = useColumnDrag(deckStore, {
  columns: $style.columns,
  columnSection: $style.columnSection,
  colResizeHandle: $style.colResizeHandle,
})
const isCompact = useIsCompactLayout()

const columnMap = computed(() => deckStore.columnMap)

// Column resize
const { resizingColId, startColumnResize, WIDE_COLUMN_TYPES } = useColumnResize(
  columnMap,
  deckStore,
)

// Column visibility tracking (pauses streaming for off-screen columns)
const colVisibility = provideColumnVisibility()
const columnsRef = ref<HTMLElement | null>(null)

onMounted(() => {
  colVisibility.setup(columnsRef)

  // Preload chunks for the user's configured column types (production only —
  // in dev, each import() triggers on-demand transpilation which is slow on WSL2)
  if (import.meta.env.PROD) {
    for (const col of deckStore.columns) {
      COLUMN_PRELOADERS[col.type]?.()
    }
  }
})

onUnmounted(() => {
  colVisibility.disconnect()
})

// Re-observe column cells when layout changes
watch(
  () => deckStore.windowLayout,
  () => {
    if (!columnsRef.value) return
    for (const cell of columnsRef.value.querySelectorAll<HTMLElement>(
      '.stack-cell[data-column-id]',
    )) {
      colVisibility.observe(cell)
    }
  },
  { flush: 'post', deep: true, immediate: true },
)

// Drop insert placeholder
const dropInsertIndex = computed(() => {
  const dt = columnDrag.dropTarget.value
  if (!dt || !('insertIndex' in dt)) return -1
  const dragId = columnDrag.dragColumnId.value
  if (dragId) {
    const fromIdx = deckStore.windowLayout.findIndex((ids) =>
      ids.includes(dragId),
    )
    if (
      fromIdx >= 0 &&
      (dt.insertIndex === fromIdx || dt.insertIndex === fromIdx + 1)
    )
      return -1
  }
  return dt.insertIndex
})

const dropInsertWidth = computed(() => {
  const dragId = columnDrag.dragColumnId.value
  if (!dragId) return 400
  return columnMap.value.get(dragId)?.width ?? 400
})

// Template helpers
function sectionClass(group: string[]) {
  const first = group[0]
  const col = first ? columnMap.value.get(first) : undefined
  return {
    [$style.stacked]: group.length > 1,
    [$style.wideColumn]: col ? WIDE_COLUMN_TYPES.has(col.type) : false,
  }
}

function sectionWidth(group: string[]): string {
  const first = group[0]
  const col = first ? columnMap.value.get(first) : undefined
  return `${col?.width ?? 400}px`
}

function cellDropZone(colId: string): string | undefined {
  const dt = columnDrag.dropTarget.value
  if (!dt || !('columnId' in dt) || dt.columnId !== colId) return undefined
  return dt.position
}

// Wheel deltaY → scrollLeft conversion for horizontal column scrolling
function onColumnsWheel(e: WheelEvent) {
  if (!columnsRef.value) return
  const target = e.target as HTMLElement | null
  const inColumn = target?.closest('.deck-column')

  // Shift+ホイール: Windows WebView2 では横スクロールが deltaX ではなく
  // shiftKey + deltaY として送られるため、deltaX に読み替える
  const dx = e.shiftKey && e.deltaX === 0 ? e.deltaY : e.deltaX
  const dy = e.shiftKey && e.deltaX === 0 ? 0 : e.deltaY

  // deltaX主体（サムホイール・トラックパッド横スワイプ等）: カラム上でもデッキ横スクロール
  if (Math.abs(dx) > Math.abs(dy)) {
    if (inColumn) {
      e.preventDefault()
      columnsRef.value.scrollLeft += dx
    }
    return
  }
  // deltaY主体（通常ホイール）: カラム外のみ横スクロールに変換
  if (inColumn) return
  e.preventDefault()
  columnsRef.value.scrollLeft += dy
}

// Scroll position → active group index
function onColumnsScroll() {
  if (!columnsRef.value) return
  if (isCompact.value) {
    // Mobile: 1 group = full viewport width
    const w = columnsRef.value.clientWidth
    if (w === 0) return
    emit('active-column-index', Math.round(columnsRef.value.scrollLeft / w))
  } else {
    // Desktop: スクロール位置に応じて検出ポイントをビューポート内でスライド
    // 左端→左寄り、中央→中央、右端→右寄り で両端のカラムにも自然に到達
    const el = columnsRef.value
    const layout = deckStore.windowLayout
    const maxScroll = el.scrollWidth - el.clientWidth
    const progress = maxScroll > 0 ? el.scrollLeft / maxScroll : 0
    const viewPoint = el.scrollLeft + el.clientWidth * progress
    const sections = el.querySelectorAll<HTMLElement>(`:scope > section`)

    let bestGroupIdx = 0
    let bestDist = Infinity
    for (let gi = 0; gi < layout.length; gi++) {
      const section = sections[gi]
      if (section) {
        const sectionCenter = section.offsetLeft + section.offsetWidth / 2
        const dist = Math.abs(sectionCenter - viewPoint)
        if (dist < bestDist) {
          bestDist = dist
          bestGroupIdx = gi
        }
      }
    }
    emit('active-column-index', bestGroupIdx)
  }
}

// Column pointer drag (swap / stack)
function onColumnPointerDown(colId: string, e: PointerEvent) {
  const target = e.target as HTMLElement
  if (!target.closest('.column-header')) return
  columnDrag.startDrag(colId, e)
}

// Scroll to column when activeColumnId changes (keyboard nav, addColumn, etc.)
watch(
  () => deckStore.activeColumnId,
  (id) => {
    if (!id || !columnsRef.value) return
    const el = columnsRef.value.querySelector(
      `.stack-cell[data-column-id="${CSS.escape(id)}"]`,
    )
    if (el)
      el.scrollIntoView({
        behavior: 'smooth',
        block: 'nearest',
        inline: 'nearest',
      })
  },
  { flush: 'post' },
)

// Scroll to group by group index
function scrollToColumn(index: number) {
  if (!columnsRef.value) return
  if (isCompact.value) {
    // Mobile: タブタップ時は instant で即座に切り替え
    // （smooth だとハイライト線とカラム表示がずれて見える）
    columnsRef.value.scrollTo({
      left: index * columnsRef.value.clientWidth,
      behavior: 'instant',
    })
  } else {
    const sections =
      columnsRef.value.querySelectorAll<HTMLElement>(`:scope > section`)
    sections[index]?.scrollIntoView({
      behavior: 'smooth',
      inline: 'start',
      block: 'nearest',
    })
  }
}

defineExpose({ scrollToColumn, columnMap })
</script>

<template>
  <div
    ref="columnsRef"
    :class="[$style.columns, { [$style.swipeMode]: isCompact }]"
    @wheel="onColumnsWheel"
    @scroll.passive="onColumnsScroll"
  >
    <div
      v-if="dropInsertIndex === 0"
      :class="$style.dropPlaceholder"
      :style="{ flexBasis: `${dropInsertWidth}px` }"
    />
    <template
      v-for="(group, groupIndex) in deckStore.windowLayout"
      :key="group.join('-')"
    >
      <section
        :class="[$style.columnSection, sectionClass(group)]"
        :style="{ flexBasis: sectionWidth(group) }"
      >
        <div
          v-for="colId in group"
          :key="colId"
          class="stack-cell"
          :class="[$style.stackCell, {
            [$style.dragSource]: columnDrag.dragColumnId.value === colId,
          }]"
          :data-column-id="colId"
          :data-drop-zone="cellDropZone(colId)"
          @mousedown="deckStore.setActiveColumn(colId)"
          @pointerdown="onColumnPointerDown(colId, $event)"
        >
          <KeepAlive :max="6">
            <component
              v-if="
                colVisibility.isColumnMounted(colId) &&
                columnMap.get(colId) &&
                COLUMN_COMPONENTS[columnMap.get(colId)!.type]
              "
              :is="COLUMN_COMPONENTS[columnMap.get(colId)!.type]"
              :key="colId"
              :column="columnMap.get(colId)!"
            />
          </KeepAlive>
        </div>
      </section>
      <div
        v-if="!isCompact"
        :class="[$style.colResizeHandle, { [$style.active]: resizingColId === group[0] }]"
        @mousedown="startColumnResize(group[0]!, $event)"
      />
      <div
        v-if="dropInsertIndex === groupIndex + 1"
        :class="$style.dropPlaceholder"
        :style="{ flexBasis: `${dropInsertWidth}px` }"
      />
    </template>
  </div>
</template>

<style lang="scss" module>
.columns {
  flex: 1;
  display: flex;
  gap: var(--nd-columnGap);
  padding: var(--nd-columnGap);
  overflow-x: auto;
  overflow-y: clip;
  overscroll-behavior: contain;
  min-width: 0;
  min-height: 0;
}

.columnSection {
  flex: 0 0 auto;
  min-width: 280px;
  max-width: 600px;
  display: flex;
  flex-direction: column;
  contain: layout style;
}

.wideColumn {
  max-width: 1200px;
}

.stacked {
  display: flex;
  flex-direction: column;
  gap: var(--nd-columnGap, 6px);

  .stackCell {
    flex: 1;
    min-height: 0;
  }
}

.stackCell {
  position: relative;
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;

  &[data-drop-zone]::after {
    content: '';
    position: absolute;
    left: 0;
    right: 0;
    pointer-events: none;
    z-index: 10;
    border-radius: 10px;
  }

  &[data-drop-zone="swap"]::after {
    inset: 0;
    background: color-mix(in srgb, var(--nd-accent) 20%, transparent);
    border: 2px solid var(--nd-accent);
  }

  &[data-drop-zone="above"]::after {
    top: 0;
    height: 50%;
    background: var(--nd-accent-hover);
    border-bottom: 3px solid var(--nd-accent);
    border-radius: 10px 10px 0 0;
  }

  &[data-drop-zone="below"]::after {
    bottom: 0;
    height: 50%;
    background: var(--nd-accent-hover);
    border-top: 3px solid var(--nd-accent);
    border-radius: 0 0 10px 10px;
  }
}

.dragSource {
  opacity: 0.4;
}

.colResizeHandle {
  flex: 0 0 4px;
  cursor: col-resize;
  background: transparent;
  transition: background var(--nd-duration-base);

  &:hover,
  &.active {
    background: var(--nd-accent);
    opacity: 0.4;
  }

  &.active {
    opacity: 0.6;
  }
}

.dropPlaceholder {
  flex-shrink: 0;
  border: 2px dashed var(--nd-accent);
  border-radius: 10px;
  background: var(--nd-accent-subtle);
  box-shadow: 0 0 12px color-mix(in srgb, var(--nd-accent) 30%, transparent);
}

/* Mobile platform: full-width swipe columns */
.swipeMode {
  scroll-snap-type: x mandatory;
  gap: 0;
  padding: 0;

  .columnSection {
    flex: 0 0 100% !important;
    min-width: 100% !important;
    max-width: 100% !important;
    scroll-snap-align: start;
  }
}
</style>
