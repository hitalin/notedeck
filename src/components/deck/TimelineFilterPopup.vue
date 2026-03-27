<script setup lang="ts">
import { onUnmounted, toRef, watch } from 'vue'
import type { TimelineFilter } from '@/adapters/types'
import { useVaporTransition } from '@/composables/useVaporTransition'

const props = defineProps<{
  show: boolean
  filterKeys: (keyof TimelineFilter)[]
  filters: TimelineFilter
  position: { top: number; left: number }
  themeVars?: Record<string, string>
}>()

const { visible, leaving } = useVaporTransition(toRef(props, 'show'), {
  enterDuration: 200,
  leaveDuration: 200,
})

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
    <div
      v-if="visible"
      :class="[leaving ? $style.filterPopupLeave : $style.filterPopupEnter]"
      class="nd-filter-popup _popup"
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
  </Teleport>
</template>

<style>
/* Teleported filter popup — unscoped */
.nd-filter-popup {
  position: fixed;
  z-index: calc(var(--nd-z-popup) + 1);
  width: 220px;
  padding: 8px 0;
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
  transition: background var(--nd-duration-base);
}

.nd-filter-item:hover {
  background: var(--nd-buttonHoverBg, rgba(255, 255, 255, 0.05));
}

.nd-filter-label {
  font-size: 0.9em;
}

</style>

<style lang="scss" module>
.filterPopupEnter { animation: filterPopupIn 0.2s var(--nd-ease-pop); }
.filterPopupLeave { animation: filterPopupOut 0.2s var(--nd-ease-pop) forwards; }
@keyframes filterPopupIn { from { opacity: 0; transform: scale(0.95) translateY(-4px); } }
@keyframes filterPopupOut { to { opacity: 0; transform: scale(0.95) translateY(-4px); } }
</style>
