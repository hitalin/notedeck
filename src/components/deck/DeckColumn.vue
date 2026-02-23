<script setup lang="ts">
import { ref } from 'vue'
import { useDeckStore } from '@/stores/deck'

const props = defineProps<{
  columnId: string
  title: string
  icon?: string
  color?: string
}>()

const deckStore = useDeckStore()
const dragging = ref(false)
const dragHover = ref(false)

function close() {
  deckStore.removeColumn(props.columnId)
}

function hasColumnData(dt: DataTransfer): boolean {
  return Array.from(dt.types).includes('text/x-nd-column')
}

function onDragStart(e: DragEvent) {
  if (!e.dataTransfer) return
  e.dataTransfer.effectAllowed = 'move'
  e.dataTransfer.setData('text/x-nd-column', props.columnId)
  dragging.value = true
}

function onDragEnd() {
  dragging.value = false
}

function onDragOver(e: DragEvent) {
  if (!e.dataTransfer || !hasColumnData(e.dataTransfer)) return
  e.preventDefault()
  e.dataTransfer.dropEffect = 'move'
  dragHover.value = true
}

function onDragLeave() {
  dragHover.value = false
}

function onDrop(e: DragEvent) {
  dragHover.value = false
  if (!e.dataTransfer) return
  const fromId = e.dataTransfer.getData('text/x-nd-column')
  if (!fromId || fromId === props.columnId) return
  e.preventDefault()

  const fromIdx = deckStore.layout.findIndex((ids) => ids.includes(fromId))
  const toIdx = deckStore.layout.findIndex((ids) =>
    ids.includes(props.columnId),
  )
  if (fromIdx >= 0 && toIdx >= 0) {
    deckStore.swapColumns(fromIdx, toIdx)
  }
}
</script>

<template>
  <section
    class="deck-column"
    :class="{ dragging, dragHover }"
    @dragover="onDragOver"
    @dragleave="onDragLeave"
    @drop="onDrop"
  >
    <header
      class="column-header"
      draggable="true"
      @dragstart="onDragStart"
      @dragend="onDragEnd"
    >
      <!-- Color indicator bar (Misskey style) -->
      <div
        class="color-indicator"
        :style="{ background: color || 'var(--nd-accent)' }"
      />

      <span v-if="icon" class="header-icon">{{ icon }}</span>
      <span class="header-title">{{ title }}</span>

      <!-- Grabber (Misskey 6-dot pattern) -->
      <svg class="grabber" viewBox="0 0 24 24" width="14" height="14">
        <path d="M10 13a1 1 0 1 0-2 0 1 1 0 0 0 2 0Zm0-4a1 1 0 1 0-2 0 1 1 0 0 0 2 0Zm0-4a1 1 0 1 0-2 0 1 1 0 0 0 2 0Zm6 8a1 1 0 1 0-2 0 1 1 0 0 0 2 0Zm0-4a1 1 0 1 0-2 0 1 1 0 0 0 2 0Zm0-4a1 1 0 1 0-2 0 1 1 0 0 0 2 0Z" fill="currentColor" />
      </svg>

      <!-- Close button -->
      <button class="_button header-btn" title="Close" @click.stop="close">
        <svg viewBox="0 0 24 24" width="14" height="14">
          <path
            d="M18 6 6 18M6 6l12 12"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            fill="none"
          />
        </svg>
      </button>
    </header>

    <div class="column-sub-header">
      <slot name="header-extra" />
    </div>

    <div class="column-body">
      <slot />
    </div>

    <!-- Drag hover overlay -->
    <div v-if="dragHover" class="drop-overlay" />
  </section>
</template>

<style scoped>
.deck-column {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  background: var(--nd-panel);
  border-radius: 10px;
  overflow: clip;
  contain: layout paint style;
  container-type: inline-size;
  position: relative;
}

.deck-column.dragging {
  box-shadow: 0 0 0 2px var(--nd-accent);
}

.column-header {
  position: relative;
  display: flex;
  align-items: center;
  gap: 6px;
  height: 38px;
  line-height: 38px;
  padding: 0 8px 0 28px;
  background: var(--nd-panelHeaderBg);
  color: var(--nd-panelHeaderFg);
  font-size: 0.9em;
  font-weight: bold;
  flex-shrink: 0;
  cursor: grab;
  user-select: none;
  z-index: 2;
  overflow: clip;
}

.column-header:active {
  cursor: grabbing;
}

.color-indicator {
  position: absolute;
  top: 12px;
  left: 12px;
  width: 3px;
  height: calc(100% - 24px);
  border-radius: 999px;
}

.header-icon {
  font-size: 1em;
  flex-shrink: 0;
}

.header-title {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 0.85em;
}

.grabber {
  flex-shrink: 0;
  opacity: 0.35;
  cursor: grab;
  margin-left: auto;
}

.grabber:hover {
  opacity: 0.6;
}

.header-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border-radius: 6px;
  flex-shrink: 0;
  opacity: 0.5;
}

.header-btn:hover {
  background: var(--nd-buttonHoverBg);
  opacity: 1;
}

.column-sub-header {
  flex-shrink: 0;
}

.column-body {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background-color: var(--nd-bg);
}

.drop-overlay {
  position: absolute;
  inset: 0;
  border-radius: 10px;
  background: var(--nd-focus);
  pointer-events: none;
  z-index: 10;
}
</style>
