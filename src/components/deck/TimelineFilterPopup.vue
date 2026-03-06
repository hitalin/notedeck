<script setup lang="ts">
import { onUnmounted, watch } from 'vue'
import type { TimelineFilter } from '@/adapters/types'

const props = defineProps<{
  show: boolean
  filterKeys: (keyof TimelineFilter)[]
  filters: TimelineFilter
  position: { top: number; left: number }
  themeVars?: Record<string, string>
}>()

const emit = defineEmits<{
  close: []
  toggle: [key: keyof TimelineFilter]
}>()

const FILTER_LABELS: Record<keyof TimelineFilter, string> = {
  withRenotes: 'リノート',
  withReplies: 'リプライ',
  withFiles: 'ファイル付きのみ',
  withBots: 'Bot',
  withSensitive: 'センシティブ',
}

function isFilterActive(key: keyof TimelineFilter): boolean {
  const v = props.filters[key]
  if (key === 'withFiles') return v === true
  return v === false
}

function handleClose() {
  emit('close')
}

watch(
  () => props.show,
  (val) => {
    if (val) {
      setTimeout(() => {
        document.addEventListener('click', handleClose, { once: true })
      }, 0)
    }
  },
)

onUnmounted(() => {
  document.removeEventListener('click', handleClose)
})
</script>

<template>
  <Teleport to="body">
    <Transition name="nd-filter-popup">
      <div
        v-if="show"
        class="nd-filter-popup"
        :style="{ ...themeVars, top: position.top + 'px', left: position.left + 'px' }"
        @click.stop
      >
        <div class="nd-filter-popup-header">フィルター</div>
        <div
          v-for="key in filterKeys"
          :key="key"
          class="nd-filter-item"
          @click="emit('toggle', key)"
        >
          <span class="nd-filter-label">{{ FILTER_LABELS[key] }}</span>
          <button
            class="nd-toggle-switch"
            :class="{ on: key === 'withFiles' ? isFilterActive(key) : !isFilterActive(key) }"
            :aria-checked="key === 'withFiles' ? isFilterActive(key) : !isFilterActive(key)"
            role="switch"
          >
            <span class="nd-toggle-switch-knob" />
          </button>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style>
/* Teleported filter popup — unscoped */
.nd-filter-popup {
  position: fixed;
  z-index: 10001;
  width: 220px;
  padding: 8px 0;
  background: color-mix(in srgb, var(--nd-popup, var(--nd-panelBg)) 85%, transparent);
  border-radius: 12px;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.15);
  backdrop-filter: blur(16px);
  color: var(--nd-fg, #fff);
  font-size: 0.9em;
}

.nd-filter-popup-header {
  padding: 8px 14px 4px;
  font-size: 0.75em;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  opacity: 0.5;
}

.nd-filter-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 14px;
  cursor: pointer;
  transition: background 0.15s;
}

.nd-filter-item:hover {
  background: var(--nd-buttonHoverBg, rgba(255, 255, 255, 0.05));
}

.nd-filter-label {
  font-size: 0.9em;
}

.nd-filter-popup-enter-active,
.nd-filter-popup-leave-active {
  transition: opacity 0.2s cubic-bezier(0, 0, 0.2, 1), transform 0.2s cubic-bezier(0, 0, 0.2, 1);
}

.nd-filter-popup-enter-from,
.nd-filter-popup-leave-to {
  opacity: 0;
  transform: scale(0.95) translateY(-4px);
}
</style>
