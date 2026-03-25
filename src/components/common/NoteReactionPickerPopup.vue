<script setup lang="ts">
import { storeToRefs } from 'pinia'
import { defineAsyncComponent, nextTick, ref, watch } from 'vue'

import { useFocusTrap } from '@/composables/useFocusTrap'
import { useVaporTransition } from '@/composables/useVaporTransition'
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

const { visible, leaving } = useVaporTransition(show, {
  enterDuration: 400,
  leaveDuration: 300,
})

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
    <div
      v-if="visible"
      :class="[
        $style.popupBackdrop,
        isCompact && $style.mobile,
        leaving ? (isCompact ? $style.sheetLeave : $style.popupLeave) : (isCompact ? $style.sheetEnter : $style.popupEnter),
      ]"
      @click="close"
    >
      <div
        ref="pickerRef"
        :class="[
          $style.reactionPickerPopup,
          leaving ? (isCompact ? $style.sheetContentLeave : $style.popupContentLeave) : (isCompact ? $style.sheetContentEnter : $style.popupContentEnter),
        ]"
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

/* Desktop popup backdrop */
.popupEnter { animation: popupBdIn 0.3s ease; }
.popupLeave { animation: popupBdOut 0.3s ease forwards; }
@keyframes popupBdIn { from { opacity: 0; } }
@keyframes popupBdOut { to { opacity: 0; } }

/* Desktop popup content */
.popupContentEnter { animation: popupIn 0.3s ease; }
.popupContentLeave { animation: popupOut 0.3s ease forwards; }
@keyframes popupIn { from { opacity: 0; transform: translateX(-100%) scale(0.95); } }
@keyframes popupOut { to { opacity: 0; transform: translateX(-100%) scale(0.95); } }

/* Mobile sheet backdrop */
.sheetEnter { animation: sheetBdIn 0.4s ease; }
.sheetLeave { animation: sheetBdOut 0.3s ease forwards; }
@keyframes sheetBdIn { from { opacity: 0; } }
@keyframes sheetBdOut { to { opacity: 0; } }

/* Mobile sheet content */
.sheetContentEnter { animation: sheetIn 0.4s cubic-bezier(0.16, 1, 0.3, 1); }
.sheetContentLeave { animation: sheetOut 0.3s cubic-bezier(0.16, 1, 0.3, 1) forwards; }
@keyframes sheetIn { from { transform: translateY(100%); } }
@keyframes sheetOut { to { transform: translateY(100%); } }
</style>
