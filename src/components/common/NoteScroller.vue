<script setup lang="ts" generic="T extends { id: string }">
import { useVirtualizer } from '@tanstack/vue-virtual'
import { computed, ref, watch } from 'vue'

const props = withDefaults(
  defineProps<{
    items: T[]
    /** Estimated item height for virtualizer sizing */
    estimatedHeight?: number
    /** When set, highlights the focused item */
    focusedId?: string
    /** Set of note IDs currently animating (slide-in for new streaming notes) */
    animatingIds?: ReadonlySet<string>
  }>(),
  { estimatedHeight: 150, focusedId: undefined, animatingIds: () => new Set() },
)

const emit = defineEmits<{
  scroll: [event: Event]
}>()

const scrollContainer = ref<HTMLElement | null>(null)

const count = computed(() => props.items.length)

const virtualizerOptions = computed(() => ({
  count: count.value,
  getScrollElement: () => scrollContainer.value,
  estimateSize: () => props.estimatedHeight,
  overscan: 5,
  getItemKey: (index: number) => props.items[index]?.id ?? index,
}))

const virtualizer = useVirtualizer(virtualizerOptions)

const virtualItems = computed(() => virtualizer.value.getVirtualItems())
const totalSize = computed(() => virtualizer.value.getTotalSize())

function measureElement(el: Element | ComponentPublicInstance | null) {
  if (el instanceof HTMLElement) {
    virtualizer.value.measureElement(el)
  }
}

// Re-measure all when items change (e.g. streaming insert, load-more)
watch(count, () => {
  virtualizer.value.measure()
})

defineExpose({
  /** Expose the raw DOM element so composables can read scrollTop, scrollHeight, etc. */
  getElement: () => scrollContainer.value,
})

defineSlots<{
  default(props: { item: T; index: number }): unknown
  prepend(): unknown
  append(): unknown
}>()
</script>

<script lang="ts">
import type { ComponentPublicInstance } from 'vue'
</script>

<template>
  <div
    ref="scrollContainer"
    :class="$style.noteScroller"
    @scroll.passive="emit('scroll', $event)"
  >
    <slot name="prepend" />
    <div :class="$style.noteList" :style="{ height: `${totalSize}px` }">
      <div
        v-for="vRow in virtualItems"
        :key="props.items[vRow.index].id"
        :ref="measureElement"
        :data-index="vRow.index"
        :class="[
          $style.noteItem,
          animatingIds.has(props.items[vRow.index].id) && $style.enterAnimation,
        ]"
        :style="{
          transform: `translateY(${vRow.start}px)`,
        }"
      >
        <slot :item="props.items[vRow.index]" :index="vRow.index" />
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
}

/* Misskey-style slide-in animation for streaming notes.
   Replaces TransitionGroup enter with CSS @keyframes —
   Vapor Mode compatible (no <TransitionGroup> dependency). */
.enterAnimation {
  animation: noteSlideIn 0.7s cubic-bezier(0.23, 1, 0.32, 1);
}

@keyframes noteSlideIn {
  from {
    opacity: 0;
    transform: translateY(max(-64px, -100%));
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

@media (prefers-reduced-motion: reduce) {
  .enterAnimation {
    animation: none;
  }
}
</style>
