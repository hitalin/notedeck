<script setup lang="ts">
import type { Component } from 'vue'
import {
  computed,
  defineAsyncComponent,
  onMounted,
  onUnmounted,
  ref,
  watch,
} from 'vue'
import type { useColumnDrag } from '@/composables/useColumnDrag'
import { useColumnResize } from '@/composables/useColumnResize'
import { provideColumnVisibility } from '@/composables/useColumnVisibility'
import type { DeckColumn } from '@/stores/deck'
import { useDeckStore } from '@/stores/deck'

const props = defineProps<{
  columnDrag: ReturnType<typeof useColumnDrag>
}>()

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

const deckStore = useDeckStore()

// Column lookup map — store を直接参照（将来 windowId でフィルタ可能）
const columnMap = computed(() => {
  const map = new Map<string, DeckColumn>()
  for (const col of deckStore.columns) {
    map.set(col.id, col)
  }
  return map
})

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
})

onUnmounted(() => {
  colVisibility.disconnect()
})

// Re-observe column cells when layout changes
watch(
  () => deckStore.layout,
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
  const dt = props.columnDrag.dropTarget.value
  if (!dt || !('insertIndex' in dt)) return -1
  const dragId = props.columnDrag.dragColumnId.value
  if (dragId) {
    const fromIdx = deckStore.layout.findIndex((ids) => ids.includes(dragId))
    if (
      fromIdx >= 0 &&
      (dt.insertIndex === fromIdx || dt.insertIndex === fromIdx + 1)
    )
      return -1
  }
  return dt.insertIndex
})

const dropInsertWidth = computed(() => {
  const dragId = props.columnDrag.dragColumnId.value
  if (!dragId) return 400
  return columnMap.value.get(dragId)?.width ?? 400
})

// Template helpers
function sectionClass(group: string[]) {
  const first = group[0]
  const col = first ? columnMap.value.get(first) : undefined
  return {
    stacked: group.length > 1,
    'wide-column': col ? WIDE_COLUMN_TYPES.has(col.type) : false,
  }
}

function sectionWidth(group: string[]): string {
  const first = group[0]
  const col = first ? columnMap.value.get(first) : undefined
  return `${col?.width ?? 400}px`
}

function cellDropZone(colId: string): string | undefined {
  const dt = props.columnDrag.dropTarget.value
  if (!dt || !('columnId' in dt) || dt.columnId !== colId) return undefined
  return dt.position
}

// Wheel deltaY → scrollLeft conversion for horizontal column scrolling
function onColumnsWheel(e: WheelEvent) {
  if (!columnsRef.value) return
  if (Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return
  const target = e.target as HTMLElement | null
  if (target?.closest('.deck-column')) return
  e.preventDefault()
  columnsRef.value.scrollLeft += e.deltaY
}

// Mobile: scroll position → active column index
function onColumnsScroll() {
  if (!columnsRef.value) return
  const w = columnsRef.value.clientWidth
  if (w === 0) return
  emit('active-column-index', Math.round(columnsRef.value.scrollLeft / w))
}

// Column pointer drag (swap / stack)
function onColumnPointerDown(colId: string, e: PointerEvent) {
  const target = e.target as HTMLElement
  if (!target.closest('.column-header')) return
  props.columnDrag.startDrag(colId, e)
}

// Scroll to column when activeColumnId changes via keyboard navigation
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
)

// Expose for DeckLayout (mobile scroll-to-column)
function scrollToColumn(index: number) {
  if (!columnsRef.value) return
  columnsRef.value.scrollTo({
    left: index * columnsRef.value.clientWidth,
    behavior: 'smooth',
  })
}

defineExpose({ scrollToColumn, columnMap })
</script>

<template>
  <div
    ref="columnsRef"
    class="columns"
    @wheel="onColumnsWheel"
    @scroll="onColumnsScroll"
  >
    <div
      v-if="dropInsertIndex === 0"
      class="drop-placeholder"
      :style="{ flexBasis: `${dropInsertWidth}px` }"
    />
    <template
      v-for="(group, groupIndex) in deckStore.layout"
      :key="group.join('-')"
    >
      <section
        class="column-section"
        :class="sectionClass(group)"
        :style="{ flexBasis: sectionWidth(group) }"
      >
        <div
          v-for="colId in group"
          :key="colId"
          class="stack-cell"
          :class="{
            'drag-source': columnDrag.dragColumnId.value === colId,
          }"
          :data-column-id="colId"
          :data-drop-zone="cellDropZone(colId)"
          @mousedown="deckStore.setActiveColumn(colId)"
          @pointerdown="onColumnPointerDown(colId, $event)"
        >
          <component
            v-if="
              columnMap.get(colId) &&
              COLUMN_COMPONENTS[columnMap.get(colId)!.type]
            "
            :is="COLUMN_COMPONENTS[columnMap.get(colId)!.type]"
            :column="columnMap.get(colId)!"
          />
        </div>
      </section>
      <div
        class="col-resize-handle"
        :class="{ active: resizingColId === group[0] }"
        @mousedown="startColumnResize(group[0]!, $event)"
      />
      <div
        v-if="dropInsertIndex === groupIndex + 1"
        class="drop-placeholder"
        :style="{ flexBasis: `${dropInsertWidth}px` }"
      />
    </template>
  </div>
</template>

<style scoped>
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

.column-section {
  flex: 0 0 auto;
  min-width: 280px;
  max-width: 600px;
  display: flex;
  flex-direction: column;
  contain: layout style;
}

.column-section.wide-column {
  max-width: 1200px;
}

/* Stacked columns (vertical split) */
.column-section.stacked {
  display: flex;
  flex-direction: column;
  gap: var(--nd-columnGap, 6px);
}

.stack-cell {
  position: relative;
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.column-section.stacked .stack-cell {
  flex: 1;
  min-height: 0;
}

/* Column drag feedback */
.stack-cell.drag-source {
  opacity: 0.4;
}

.stack-cell[data-drop-zone]::after {
  content: '';
  position: absolute;
  left: 0;
  right: 0;
  pointer-events: none;
  z-index: 10;
  border-radius: 10px;
}

.stack-cell[data-drop-zone="swap"]::after {
  inset: 0;
  background: color-mix(in srgb, var(--nd-accent) 20%, transparent);
  border: 2px solid var(--nd-accent);
}

.stack-cell[data-drop-zone="above"]::after {
  top: 0;
  height: 50%;
  background: color-mix(in srgb, var(--nd-accent) 15%, transparent);
  border-bottom: 3px solid var(--nd-accent);
  border-radius: 10px 10px 0 0;
}

.stack-cell[data-drop-zone="below"]::after {
  bottom: 0;
  height: 50%;
  background: color-mix(in srgb, var(--nd-accent) 15%, transparent);
  border-top: 3px solid var(--nd-accent);
  border-radius: 0 0 10px 10px;
}

.col-resize-handle {
  flex: 0 0 4px;
  cursor: col-resize;
  background: transparent;
  transition: background 0.15s;
}

.col-resize-handle:hover,
.col-resize-handle.active {
  background: var(--nd-accent);
  opacity: 0.4;
}

.col-resize-handle.active {
  opacity: 0.6;
}

.drop-placeholder {
  flex-shrink: 0;
  border: 2px dashed var(--nd-accent);
  border-radius: 10px;
  background: color-mix(in srgb, var(--nd-accent) 10%, transparent);
  box-shadow: 0 0 12px color-mix(in srgb, var(--nd-accent) 30%, transparent);
}

@media (max-width: 500px) {
  .col-resize-handle {
    display: none !important;
  }

  .columns {
    scroll-snap-type: x mandatory;
    gap: 0;
    padding: 0;
  }

  .column-section {
    flex: 0 0 100% !important;
    min-width: 100% !important;
    max-width: 100% !important;
    scroll-snap-align: start;
  }
}
</style>
