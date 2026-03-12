<script setup lang="ts" generic="T extends { id: string }">
import { ref } from 'vue'

const props = withDefaults(
  defineProps<{
    items: T[]
    /** Estimated item height for content-visibility placeholder */
    estimatedHeight?: number
  }>(),
  { estimatedHeight: 150 },
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
  default(props: { item: T; index: number }): any
  prepend(): any
  append(): any
}>()
</script>

<template>
  <div
    ref="scrollContainer"
    class="note-scroller"
    @scroll.passive="$emit('scroll', $event)"
  >
    <slot name="prepend" />
    <TransitionGroup name="note" tag="div" class="note-list">
      <div
        v-for="(item, index) in props.items"
        :key="item.id"
        class="note-item"
        :style="{ containIntrinsicSize: `0 ${props.estimatedHeight}px` }"
      >
        <slot :item="item" :index="index" />
      </div>
    </TransitionGroup>
    <slot name="append" />
  </div>
</template>

<style scoped>
.note-scroller {
  overflow-y: auto;
  height: 100%;
  overscroll-behavior: contain;
}

.note-list {
  position: relative;
}

.note-item {
  content-visibility: auto;
  contain-intrinsic-size: 0 150px; /* fallback, overridden by inline style */
  contain: content;
}

/* TransitionGroup animations */
.note-enter-active {
  transition: opacity 0.2s ease, transform 0.2s ease;
}

.note-leave-active {
  transition: opacity 0.15s ease;
}

.note-enter-from {
  opacity: 0;
  transform: translateY(-20px);
}

.note-leave-to {
  opacity: 0;
}

.note-move {
  transition: transform 0.2s ease;
}
</style>
