<script setup lang="ts" generic="T extends { id: string }">
import {
  useVirtualizer,
  type VirtualItem,
  type Virtualizer,
} from '@tanstack/vue-virtual'
import { computed, ref } from 'vue'

const props = withDefaults(
  defineProps<{
    items: T[]
    /** Estimated item height for virtualizer sizing */
    estimatedHeight?: number
    /** When set, highlights the focused item (passed through, not used internally) */
    focusedId?: string
    /** Set of note IDs currently animating (slide-in for new streaming notes) */
    animatingIds?: ReadonlySet<string>
  }>(),
  { estimatedHeight: 150, focusedId: undefined, animatingIds: () => new Set() },
)

const emit = defineEmits<{
  scroll: [event: Event]
  'near-end': []
}>()

const scrollContainer = ref<HTMLElement | null>(null)

// Dynamic estimateSize — exponential moving average (EMA) of measured item heights.
// Converges fast during bootstrap (first 5), then tracks recent height trends.
const EMA_ALPHA = 0.15
let _emaValue = props.estimatedHeight
let _measuredCount = 0
const dynamicEstimate = ref(props.estimatedHeight)

const virtualizerOptions = computed(() => ({
  count: props.items.length,
  getScrollElement: () => scrollContainer.value,
  estimateSize: () => dynamicEstimate.value,
  overscan: 5,
  getItemKey: (index: number) => props.items[index]?.id ?? index,
  shouldAdjustScrollPositionOnItemSizeChange: (
    item: VirtualItem,
    _delta: number,
    instance: Virtualizer<HTMLElement, Element>,
  ) =>
    item.start <
    (instance.scrollOffset ?? 0) +
      (instance as unknown as { scrollAdjustments: number }).scrollAdjustments,
}))

const virtualizer = useVirtualizer(virtualizerOptions)

const virtualItems = computed(() => virtualizer.value.getVirtualItems())
const totalSize = computed(() => virtualizer.value.getTotalSize())

/** Indices of items near the viewport (visible + 2 overscan) for eager image loading */
const nearViewportRange = computed(() => {
  const items = virtualItems.value
  const first = items[0]
  const last = items[items.length - 1]
  if (!first || !last) return { start: 0, end: 0 }
  const el = scrollContainer.value
  if (!el) return { start: first.index, end: last.index }
  const scrollTop = el.scrollTop
  const viewEnd = scrollTop + el.clientHeight
  let start = first.index
  let end = last.index
  for (const item of items) {
    if (item.end >= scrollTop) {
      start = Math.max(0, item.index - 2)
      break
    }
  }
  for (let i = items.length - 1; i >= 0; i--) {
    const item = items[i]
    if (item && item.start <= viewEnd) {
      end = item.index + 2
      break
    }
  }
  return { start, end }
})

function measureElement(el: unknown) {
  if (!(el instanceof HTMLElement)) return
  virtualizer.value.measureElement(el)
  const h = el.offsetHeight
  if (h <= 0) return

  _measuredCount++
  if (_measuredCount <= 5) {
    // Bootstrap: simple incremental average for fast convergence
    _emaValue += (h - _emaValue) / _measuredCount
  } else {
    _emaValue = EMA_ALPHA * h + (1 - EMA_ALPHA) * _emaValue
  }
  if (_measuredCount <= 5 || _measuredCount % 5 === 0) {
    dynamicEstimate.value = Math.round(_emaValue)
  }
}

// Near-end detection for load-more, throttled to 200ms.
let _lastNearEnd = 0
function onScroll(e: Event) {
  emit('scroll', e)
  const now = Date.now()
  if (now - _lastNearEnd < 200) return
  const items = virtualizer.value.getVirtualItems()
  const last = items[items.length - 1]
  if (last && last.index >= props.items.length - 5) {
    _lastNearEnd = now
    emit('near-end')
  }
}

// NOTE: Do NOT call virtualizer.measure() on items.length change.
// measure() clears the entire itemSizeCache, forcing all items back to estimateSize.
// TanStack recalculates automatically when options.count changes via the computed.

defineExpose({
  getElement: () => scrollContainer.value,
  scrollToIndex: (
    index: number,
    opts?: {
      align?: 'auto' | 'start' | 'center' | 'end'
      behavior?: ScrollBehavior
    },
  ) => {
    virtualizer.value.scrollToIndex(index, {
      align: opts?.align ?? 'auto',
      behavior: opts?.behavior ?? 'smooth',
    })
  },
})

defineSlots<{
  default(props: { item: T; index: number; nearViewport: boolean }): unknown
  prepend(): unknown
  append(): unknown
}>()
</script>

<template>
  <div
    ref="scrollContainer"
    :class="$style.noteScroller"
    @scroll.passive="onScroll"
  >
    <slot name="prepend" />
    <div :class="$style.noteList" :style="{ height: `${totalSize}px` }">
      <div
        v-for="vRow in virtualItems"
        :key="props.items[vRow.index]!.id"
        :ref="measureElement"
        :data-index="vRow.index"
        :class="[
          $style.noteItem,
          animatingIds.has(props.items[vRow.index]!.id) && $style.enterAnimation,
        ]"
        :style="{ translate: `0 ${vRow.start}px` }"
      >
        <slot :item="props.items[vRow.index]!" :index="vRow.index" :near-viewport="vRow.index >= nearViewportRange.start && vRow.index <= nearViewportRange.end" />
      </div>
    </div>
    <slot name="append" />
  </div>
</template>

<style lang="scss" module>
.noteScroller {
  overflow-y: auto;
  height: 100%;
  overscroll-behavior: contain;
}

.noteList {
  position: relative;
  width: 100%;
}

.noteItem {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  contain: layout style paint;
}

/* Misskey-style slide-in animation for streaming notes.
   Uses CSS @keyframes instead of TransitionGroup — Vapor Mode compatible.
   Positioning uses the `translate` property (set via inline style),
   so `transform` is free for animation without conflict. */
.enterAnimation {
  animation: noteSlideIn 0.7s cubic-bezier(0.23, 1, 0.32, 1);
}

@keyframes noteSlideIn {
  from {
    opacity: 0;
    transform: translateY(max(-64px, -100%));
  }
  /* `to` is omitted — browser resolves to the element's computed style
     (transform: none), so the slide naturally lands at the positioned offset. */
}

@media (prefers-reduced-motion: reduce) {
  .enterAnimation {
    animation: none;
  }
}
</style>
