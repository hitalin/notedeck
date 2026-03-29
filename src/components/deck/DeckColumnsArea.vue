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

// Windows horizontal wheel: listen for Tauri event from hwheel_hook
let unlistenHWheel: (() => void) | null = null

onMounted(async () => {
  // Passive wheel listener — lets the browser optimize scroll on the compositor thread
  columnsRef.value?.addEventListener('wheel', onColumnsWheel, { passive: true })

  // Windows hwheel: Tauri イベント経由で受信 → 同じ rAF バッチに合流
  if ((window as unknown as Record<string, unknown>).__TAURI_INTERNALS__) {
    const { listen } = await import('@tauri-apps/api/event')
    unlistenHWheel = await listen<number>('nd:hwheel', (ev) => {
      scheduleScroll(ev.payload)
    })
  }

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
  columnsRef.value?.removeEventListener('wheel', onColumnsWheel)
  if (rafId) cancelAnimationFrame(rafId)
  unlistenHWheel?.()
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

// --- Horizontal scroll: passive wheel + rAF batch ---
let pendingScroll = 0
let rafId = 0

function scheduleScroll(delta: number) {
  pendingScroll += delta
  if (!rafId) {
    rafId = requestAnimationFrame(() => {
      if (columnsRef.value) {
        columnsRef.value.scrollLeft += pendingScroll
      }
      pendingScroll = 0
      rafId = 0
    })
  }
}

// Passive wheel handler — no preventDefault() needed:
// - deltaX: browser scrolls .columns natively via overflow-x: auto
// - deltaY inside column: browser scrolls column vertically
// - deltaY outside column: convert to horizontal scroll via rAF batch
function onColumnsWheel(e: WheelEvent) {
  if (!columnsRef.value) return
  // カラム内 → ブラウザのネイティブ処理に任せる
  if ((e.target as HTMLElement | null)?.closest('.deck-column')) return

  // Shift+ホイール: Windows WebView2 では横スクロールが deltaX ではなく
  // shiftKey + deltaY として送られるため、deltaX に読み替える
  const dx = e.shiftKey && e.deltaX === 0 ? e.deltaY : e.deltaX
  const dy = e.shiftKey && e.deltaX === 0 ? 0 : e.deltaY

  // deltaX 主体 → ブラウザが overflow-x: auto で処理
  if (Math.abs(dx) > Math.abs(dy)) return

  // deltaY 主体 + カラム外 → 横スクロールに変換（rAF バッチ）
  scheduleScroll(dy)
}

// Scroll position → active column (single source of truth: activeColumnId in store)
function onColumnsScroll() {
  if (!columnsRef.value) return
  const layout = deckStore.windowLayout
  let bestGroupIdx: number
  if (isCompact.value) {
    // Mobile: 1 group = full viewport width
    const w = columnsRef.value.clientWidth
    if (w === 0) return
    bestGroupIdx = Math.round(columnsRef.value.scrollLeft / w)
  } else {
    // Desktop: スクロール位置に応じて検出ポイントをビューポート内でスライド
    // 左端→左寄り、中央→中央、右端→右寄り で両端のカラムにも自然に到達
    const el = columnsRef.value
    const maxScroll = el.scrollWidth - el.clientWidth
    const progress = maxScroll > 0 ? el.scrollLeft / maxScroll : 0
    const viewPoint = el.scrollLeft + el.clientWidth * progress
    const sections = el.querySelectorAll<HTMLElement>(`:scope > section`)

    bestGroupIdx = 0
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
  }
  const colId = layout[bestGroupIdx]?.[0]
  if (colId) deckStore.setActiveColumn(colId)
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
    if (isCompact.value) {
      // Mobile: use scrollTo with pixel offset to work reliably with CSS snap scroll.
      // scrollIntoView can be overridden by scroll-snap-type: x mandatory.
      const index = deckStore.windowLayout.findIndex((group) =>
        group.includes(id),
      )
      if (index >= 0) {
        columnsRef.value.scrollTo({
          left: index * columnsRef.value.clientWidth,
          behavior: 'instant',
        })
      }
    } else {
      const el = columnsRef.value.querySelector(
        `.stack-cell[data-column-id="${CSS.escape(id)}"]`,
      )
      if (el)
        el.scrollIntoView({
          behavior: 'smooth',
          block: 'nearest',
          inline: 'nearest',
        })
    }
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
              colVisibility.isColumnMounted(colId) &&
              columnMap.get(colId) &&
              COLUMN_COMPONENTS[columnMap.get(colId)!.type]
            "
            :is="COLUMN_COMPONENTS[columnMap.get(colId)!.type]"
            :key="colId"
            :column="columnMap.get(colId)!"
          />
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
  contain: layout style paint;
  /* Staggered entrance: each column fades in with a slight upward slide.
     --col-idx is set inline; animation triggers when #app.nd-app-ready starts.
     forwards → 完了後にコンポジタレイヤーを解放 */
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
