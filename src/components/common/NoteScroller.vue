<script setup lang="ts" generic="T extends { id: string }">
import { ref } from 'vue'

const props = withDefaults(
  defineProps<{
    items: T[]
    /** Estimated item height for content-visibility placeholder */
    estimatedHeight?: number
    /** When set, enables v-memo to skip VNode diffing for unchanged items */
    focusedId?: string
  }>(),
  { estimatedHeight: 150, focusedId: undefined },
)

defineEmits<{
  scroll: [event: Event]
}>()

const scrollContainer = ref<HTMLElement | null>(null)

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

<template>
  <div
    ref="scrollContainer"
    :class="$style.noteScroller"
    @scroll.passive="$emit('scroll', $event)"
  >
    <slot name="prepend" />
    <TransitionGroup
      tag="div"
      :class="$style.noteList"
      :enter-active-class="$style.enterActive"
      :leave-active-class="$style.leaveActive"
      :enter-from-class="$style.enterFrom"
      :leave-to-class="$style.leaveTo"
      :move-class="$style.move"
    >
      <div
        v-for="(item, index) in props.items"
        :key="item.id"
        v-memo="[item, item.id === props.focusedId]"
        :class="$style.noteItem"
        :style="{ containIntrinsicSize: `0 ${props.estimatedHeight}px` }"
      >
        <slot :item="item" :index="index" />
      </div>
    </TransitionGroup>
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
}

.noteItem {
  content-visibility: auto;
  contain-intrinsic-size: 0 150px; /* fallback, overridden by inline style */
  contain: content;
}

/* Misskey-style TransitionGroup animations */
/* enter/move: elastic easing over 0.7s */
.move {
  transition: transform 0.7s cubic-bezier(0.23, 1, 0.32, 1);
}

.enterActive {
  transition: transform 0.7s cubic-bezier(0.23, 1, 0.32, 1),
              opacity 0.7s cubic-bezier(0.23, 1, 0.32, 1);

  :deep(.noteItem) {
    content-visibility: visible !important;
  }
}

.enterFrom {
  opacity: 0;
  transform: translateY(max(-64px, -100%));
}

/* leave: quick collapse */
.leaveActive {
  transition: height var(--nd-duration-slow) cubic-bezier(0, 0.5, 0.5, 1),
              opacity 0.2s cubic-bezier(0, 0.5, 0.5, 1);
}

.leaveTo {
  opacity: 0;
  height: 0;
}
</style>
