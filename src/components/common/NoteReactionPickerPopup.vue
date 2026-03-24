<script setup lang="ts">
import { storeToRefs } from 'pinia'
import { defineAsyncComponent, nextTick, ref, watch } from 'vue'

import { useFocusTrap } from '@/composables/useFocusTrap'
import { useUiStore } from '@/stores/ui'
import { extractThemeVars } from '@/utils/themeVars'

const MkReactionPicker = defineAsyncComponent(
  () => import('./MkReactionPicker.vue'),
)

const props = defineProps<{
  serverHost: string
  accountId: string
}>()

const emit = defineEmits<{
  pick: [reaction: string]
}>()

const { isCompactLayout: isCompact } = storeToRefs(useUiStore())
const show = ref(false)
const pos = ref({ x: 0, y: 0 })
const theme = ref<Record<string, string>>({})
const pickerRef = ref<HTMLElement | null>(null)

const { activate: activateTrap, deactivate: deactivateTrap } = useFocusTrap(
  pickerRef,
  {
    onEscape: () => close(),
  },
)

watch(show, (v) => {
  if (v) nextTick(activateTrap)
  else deactivateTrap()
})

function open(e: MouseEvent) {
  const btn = e.currentTarget as HTMLElement
  const rect = btn.getBoundingClientRect()
  const column = btn.closest('.deck-column') as HTMLElement | null
  const colRect = column?.getBoundingClientRect()
  const rightEdge = colRect ? colRect.right - 8 : rect.right
  pos.value = { x: rightEdge, y: rect.bottom + 4 }
  if (column) theme.value = extractThemeVars(column)
  show.value = !show.value
}

function close() {
  show.value = false
}

defineExpose({ open })
</script>

<template>
  <Teleport to="body">
    <Transition :name="isCompact ? 'nd-sheet' : 'nd-popup'">
      <div v-if="show" :class="[$style.popupBackdrop, isCompact && $style.mobile]" @click="close">
        <div
          ref="pickerRef"
          :class="$style.reactionPickerPopup"
          class="nd-popup-content reaction-picker-popup"
          :style="isCompact ? theme : { ...theme, top: pos.y + 'px', left: pos.x + 'px' }"
          @click.stop
        >
          <MkReactionPicker
            :server-host="serverHost"
            :account-id="accountId"
            @pick="(r: string) => { emit('pick', r); close() }"
          />
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style lang="scss" module>
.popupBackdrop {
  position: fixed;
  inset: 0;
  z-index: var(--nd-z-popup);
  background: transparent;

  &.mobile {
    background: rgba(0, 0, 0, 0.4);
    display: flex;
    align-items: flex-end;
  }
}

.reactionPickerPopup {
  position: fixed;
  transform: translateX(-100%);
  z-index: calc(var(--nd-z-popup) + 1);
  background: color-mix(in srgb, var(--nd-popup, var(--nd-panel)) 85%, transparent);
  backdrop-filter: blur(var(--nd-blur));
  -webkit-backdrop-filter: blur(var(--nd-blur));
  border-radius: 12px;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.3);
  overflow: hidden;

  .mobile & {
    position: static;
    transform: none;
    width: 100%;
    border-radius: 16px 16px 0 0;
    box-shadow: 0 -4px 24px rgba(0, 0, 0, 0.3);
    padding-bottom: var(--nd-safe-area-bottom, env(safe-area-inset-bottom));
  }
}
</style>

<style>
/* Override default nd-popup transform (slides from left) */
.nd-popup-enter-from .reaction-picker-popup,
.nd-popup-leave-to .reaction-picker-popup {
  transform: translateX(-100%) scale(0.95);
}

/* Mobile bottom-sheet transition */
.nd-sheet-enter-active,
.nd-sheet-leave-active {
  transition: opacity var(--nd-duration-slow) ease;
}

.nd-sheet-enter-active .reaction-picker-popup,
.nd-sheet-leave-active .reaction-picker-popup {
  transition: transform var(--nd-duration-slower) cubic-bezier(0.16, 1, 0.3, 1);
}

.nd-sheet-enter-from,
.nd-sheet-leave-to {
  opacity: 0;
}

.nd-sheet-enter-from .reaction-picker-popup,
.nd-sheet-leave-to .reaction-picker-popup {
  transform: translateY(100%);
}
</style>
