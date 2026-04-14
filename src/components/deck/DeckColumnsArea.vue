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
import { useColumnScroll } from '@/composables/useColumnScroll'
import { provideColumnVisibility } from '@/composables/useColumnVisibility'
import { useHorizontalWheel } from '@/composables/useHorizontalWheel'
import * as snapshotStore from '@/composables/useSnapshotStore'
import type { DeckColumn } from '@/stores/deck'
import { useDeckStore } from '@/stores/deck'
import { useIsCompactLayout } from '@/stores/ui'
import { COLUMN_SELECTOR } from '@/utils/themeVars'

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
  specified: defineAsyncComponent(() => import('./DeckMentionsColumn.vue')),
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
  streamInspector: defineAsyncComponent(
    () => import('./DeckStreamInspectorColumn.vue'),
  ),
  pluginManager: defineAsyncComponent(
    () => import('./DeckPluginManagerColumn.vue'),
  ),
  taskRunner: defineAsyncComponent(() => import('./DeckTaskRunnerColumn.vue')),
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

// Scroll ↔ active column synchronization
const columnScroll = useColumnScroll({
  containerRef: columnsRef,
  isCompact,
  windowLayout: computed(() => deckStore.windowLayout),
  onActiveColumnDetected: (id) => deckStore.setActiveColumn(id),
})

// Horizontal wheel → horizontal scroll conversion
const horizontalWheel = useHorizontalWheel({
  containerRef: columnsRef,
  columnSelector: COLUMN_SELECTOR,
})

// Derive a snapshot cache key from column config (mirrors each column's cache.getKey())
function getColumnCacheKey(col: DeckColumn): string | null {
  switch (col.type) {
    case 'timeline':
      return col.tl ?? null
    case 'antenna':
      return col.antennaId ? `antenna:${col.antennaId}` : null
    case 'channel':
      return col.channelId ? `channel:${col.channelId}` : null
    case 'clip':
      return col.clipId ? `clip:${col.clipId}` : null
    case 'user':
      return col.userId ? `user:${col.userId}` : null
    case 'list':
      return col.listId ? `list:${col.listId}` : null
    case 'favorites':
      return 'favorites'
    case 'mentions':
    case 'specified':
      return 'mentions'
    case 'explore':
      return 'explore'
    default:
      return null
  }
}

/** Get snapshot preview lines for an unmounted column shell */
function getShellPreview(colId: string): string[] {
  const col = columnMap.value.get(colId)
  if (!col) return []
  const cacheKey = getColumnCacheKey(col)
  if (!cacheKey) return []
  const snap = snapshotStore.restore(colId, cacheKey)
  if (!snap) return []
  return snap.notes.slice(0, 4).map((n) => {
    const text = n.cw ?? n.text ?? ''
    return text.length > 60 ? `${text.slice(0, 60)}…` : text
  })
}

const activeGroupIndex = computed(() => {
  const activeId = deckStore.activeColumnId
  if (!activeId) return 0
  const idx = deckStore.windowLayout.findIndex((group) =>
    group.includes(activeId),
  )
  return idx >= 0 ? idx : 0
})

// 可視範囲ベースのマウント判定:
// - モバイル: アクティブカラムは常にマウント、それ以外は IntersectionObserver に委ねる
// - デスクトップ: 全カラムを IntersectionObserver 判定に委ねる
//   (observe 時に initialMounted:true で開始し、非可視判定されたら columnUnloadDelay 後に自然に外れる)
function shouldMountColumn(colId: string): boolean {
  if (isCompact.value) {
    return (
      colId === deckStore.activeColumnId || colVisibility.isColumnMounted(colId)
    )
  }
  return colVisibility.isColumnMounted(colId)
}

function preloadVisiblePriorityGroups() {
  if (!import.meta.env.PROD) return
  const activeIdx = activeGroupIndex.value
  for (const [groupIndex, group] of deckStore.windowLayout.entries()) {
    if (Math.abs(groupIndex - activeIdx) > 1) continue
    for (const colId of group) {
      const col = columnMap.value.get(colId)
      if (col) COLUMN_PRELOADERS[col.type]?.()
    }
  }
}

onMounted(async () => {
  await horizontalWheel.attach()
  colVisibility.setup(columnsRef)

  // Preload only the active/nearby groups first.
  preloadVisiblePriorityGroups()
})

onUnmounted(() => {
  horizontalWheel.detach()
  colVisibility.disconnect()
})

// Re-observe column cells when layout changes, and cleanup removed columns
let prevColumnIds = new Set<string>()
watch(
  () => deckStore.windowLayout,
  (layout) => {
    if (!columnsRef.value) return
    const currentIds = new Set<string>(layout.flat())
    for (const id of prevColumnIds) {
      if (!currentIds.has(id)) colVisibility.cleanup(id)
    }
    prevColumnIds = currentIds
    // デスクトップは初回表示を滑らかにするため initialMounted:true で開始
    // モバイルは従来通り false 開始（アクティブのみ shouldMountColumn で true 判定）
    const initialMounted = !isCompact.value
    for (const cell of columnsRef.value.querySelectorAll<HTMLElement>(
      '.stack-cell[data-column-id]',
    )) {
      colVisibility.observe(cell, { initialMounted })
    }
  },
  { flush: 'post', deep: true, immediate: true },
)

// Store → scroll: single watcher for all activation paths
watch(
  () => deckStore.activeColumnId,
  (id) => {
    if (id) {
      columnScroll.scrollToColumnId(id)
      preloadVisiblePriorityGroups()
    }
  },
  { flush: 'post' },
)

// Live budget: recompute which columns are allowed to stream
// when active column or layout changes
watch(
  [() => deckStore.activeColumnId, () => deckStore.windowLayout],
  () => {
    const allColIds = deckStore.windowLayout.flat()
    colVisibility.updateLiveBudget(allColIds, deckStore.activeColumnId)
  },
  { flush: 'post', deep: true, immediate: true },
)

// Compact ↔ Desktop 切替時: アクティブカラムの位置にスクロールを合わせる
watch(
  isCompact,
  (compact) => {
    const id = deckStore.activeColumnId
    if (!compact || !id) return
    columnScroll.snapToColumnId(id)
  },
  { flush: 'post' },
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

// Column pointer drag (swap / stack)
function onColumnPointerDown(colId: string, e: PointerEvent) {
  const target = e.target as HTMLElement
  if (!target.closest('.column-grabber')) return
  columnDrag.startDrag(colId, e)
}

defineExpose({
  scrollColumnToTop: columnScroll.scrollColumnToTop,
  columnMap,
})
</script>

<template>
  <div
    ref="columnsRef"
    :class="[$style.columns, { [$style.swipeMode]: isCompact }]"
    @scroll.passive="columnScroll.onScroll"
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
        :style="{ flexBasis: sectionWidth(group), '--col-idx': groupIndex }"
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
          <component
            v-if="
              shouldMountColumn(colId) &&
              columnMap.get(colId) &&
              COLUMN_COMPONENTS[columnMap.get(colId)!.type]
            "
            :is="COLUMN_COMPONENTS[columnMap.get(colId)!.type]"
            :key="colId"
            :column="columnMap.get(colId)!"
          />
          <div
            v-else
            :class="$style.columnShell"
            aria-hidden="true"
          >
            <div :class="$style.columnShellHeader" />
            <div :class="$style.columnShellBody">
              <template v-if="getShellPreview(colId).length > 0">
                <div
                  v-for="(line, i) in getShellPreview(colId)"
                  :key="i"
                  :class="$style.columnShellPreview"
                >{{ line || '\u00A0' }}</div>
              </template>
              <template v-else>
                <div :class="$style.columnShellLine" />
                <div :class="[$style.columnShellLine, $style.columnShellLineWide]" />
                <div :class="$style.columnShellCard" />
                <div :class="$style.columnShellCard" />
              </template>
            </div>
          </div>
        </div>
      </section>
      <div
        v-if="!isCompact"
        :class="[$style.colResizeHandle, { [$style.active]: resizingColId === group[0] }]"
        @pointerdown="startColumnResize(group[0]!, $event)"
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
  contain: layout style paint;
  /* Staggered entrance: each column fades in with a slight upward slide.
     --col-idx is set inline; forwards → 完了後にコンポジタレイヤーを解放 */
  animation: nd-col-enter var(--nd-duration-slower) var(--nd-ease-spring) forwards;
  animation-delay: calc(var(--col-idx, 0) * 40ms + 50ms);
}
@keyframes nd-col-enter {
  from { opacity: 0; transform: translateY(6px); }
  to   { opacity: 1; transform: none; }
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

.columnShell {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  border-radius: 10px;
  overflow: hidden;
  background: color-mix(in srgb, var(--nd-panel) 92%, transparent);
  border: 1px solid color-mix(in srgb, var(--nd-divider, currentColor) 30%, transparent);
}

.columnShellHeader {
  height: 38px;
  flex-shrink: 0;
  background:
    linear-gradient(
      90deg,
      color-mix(in srgb, var(--nd-panelHeaderBg, var(--nd-panel)) 85%, transparent),
      color-mix(in srgb, var(--nd-panelHeaderBg, var(--nd-panel)) 60%, transparent),
      color-mix(in srgb, var(--nd-panelHeaderBg, var(--nd-panel)) 85%, transparent)
    );
  background-size: 200% 100%;
  animation: nd-shell-shimmer 1.6s linear infinite;
}

.columnShellBody {
  flex: 1;
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.columnShellLine,
.columnShellCard {
  background:
    linear-gradient(
      90deg,
      color-mix(in srgb, var(--nd-panel) 75%, transparent),
      color-mix(in srgb, var(--nd-panel) 55%, transparent),
      color-mix(in srgb, var(--nd-panel) 75%, transparent)
    );
  background-size: 200% 100%;
  animation: nd-shell-shimmer 1.6s linear infinite;
}

.columnShellLine {
  height: 10px;
  border-radius: 999px;
  width: 58%;
}

.columnShellLineWide {
  width: 82%;
}

.columnShellCard {
  height: 96px;
  border-radius: 12px;
}

@keyframes nd-shell-shimmer {
  from { background-position: 200% 0; }
  to { background-position: -200% 0; }
}

.columnShellPreview {
  padding: 8px 10px;
  font-size: 12px;
  line-height: 1.5;
  color: var(--nd-fg);
  opacity: 0.5;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  border-bottom: 1px solid color-mix(in srgb, var(--nd-divider, currentColor) 15%, transparent);
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
