<script setup lang="ts">
import { onUnmounted, ref } from 'vue'
import { useDeckStore } from '@/stores/deck'

const props = defineProps<{
  columnId: string
  title: string
  color?: string
  themeVars?: Record<string, string>
}>()

const emit = defineEmits<{ 'header-click': [] }>()

const deckStore = useDeckStore()
const dragging = ref(false)
const dragHover = ref(false)
const showMenu = ref(false)

function close() {
  deckStore.removeColumn(props.columnId)
}

function toggleMenu() {
  showMenu.value = !showMenu.value
  if (showMenu.value) {
    requestAnimationFrame(() => {
      document.addEventListener('click', closeMenu, { once: true })
    })
  }
}

function closeMenu() {
  showMenu.value = false
}

function handleRemove() {
  showMenu.value = false
  close()
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

onUnmounted(() => {
  document.removeEventListener('click', closeMenu)
})
</script>

<template>
  <section
    class="deck-column"
    :class="{ dragging, dragHover }"
    :style="themeVars"
    @dragover="onDragOver"
    @dragleave="onDragLeave"
    @drop="onDrop"
  >
    <header
      class="column-header"
      draggable="true"
      @dragstart="onDragStart"
      @dragend="onDragEnd"
      @click="emit('header-click')"
    >
      <!-- Color indicator bar (Misskey style) -->
      <div
        class="color-indicator"
        :style="{ background: color || 'var(--nd-accent)' }"
      />

      <slot name="header-icon" />
      <span class="header-title">{{ title }}</span>
      <slot name="header-meta" />

      <!-- Grabber (Misskey 6-dot pattern) -->
      <svg class="grabber" viewBox="0 0 24 24" width="14" height="14">
        <path d="M10 13a1 1 0 1 0-2 0 1 1 0 0 0 2 0Zm0-4a1 1 0 1 0-2 0 1 1 0 0 0 2 0Zm0-4a1 1 0 1 0-2 0 1 1 0 0 0 2 0Zm6 8a1 1 0 1 0-2 0 1 1 0 0 0 2 0Zm0-4a1 1 0 1 0-2 0 1 1 0 0 0 2 0Zm0-4a1 1 0 1 0-2 0 1 1 0 0 0 2 0Z" fill="currentColor" />
      </svg>

      <!-- Menu button (…) -->
      <div class="header-menu-wrap" @click.stop>
        <button class="_button header-btn" title="Menu" @click="toggleMenu">
          <svg viewBox="0 0 24 24" width="16" height="16">
            <circle cx="12" cy="5" r="1.5" fill="currentColor" />
            <circle cx="12" cy="12" r="1.5" fill="currentColor" />
            <circle cx="12" cy="19" r="1.5" fill="currentColor" />
          </svg>
        </button>
        <Transition name="menu-fade">
          <div v-if="showMenu" class="column-menu">
            <button class="_button column-menu-item danger" @click="handleRemove">
              <svg viewBox="0 0 24 24" width="16" height="16">
                <path
                  d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                  stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" fill="none"
                />
              </svg>
              <span>Remove column</span>
            </button>
          </div>
        </Transition>
      </div>
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
  overflow: visible;
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

.header-menu-wrap {
  position: relative;
  flex-shrink: 0;
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

/* Column dropdown menu */
.column-menu {
  position: absolute;
  top: 100%;
  right: 0;
  margin-top: 4px;
  min-width: 180px;
  background: var(--nd-popup, var(--nd-panel));
  border-radius: 8px;
  box-shadow: 0 4px 16px var(--nd-shadow);
  overflow: hidden;
  z-index: 100;
}

.column-menu-item {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 10px 14px;
  font-size: 0.85em;
  color: var(--nd-fg);
  cursor: pointer;
  transition: background 0.1s;
}

.column-menu-item:hover {
  background: var(--nd-buttonHoverBg);
}

.column-menu-item.danger {
  color: var(--nd-error, #ff4444);
}

.column-menu-item.danger:hover {
  background: color-mix(in srgb, var(--nd-error, #ff4444) 10%, transparent);
}

/* Menu transition */
.menu-fade-enter-active,
.menu-fade-leave-active {
  transition: opacity 0.12s, transform 0.12s;
}

.menu-fade-enter-from,
.menu-fade-leave-to {
  opacity: 0;
  transform: translateY(-4px);
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
