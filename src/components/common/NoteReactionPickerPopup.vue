<script setup lang="ts">
import { storeToRefs } from 'pinia'
import {
  computed,
  nextTick,
  ref,
  useCssModule,
  useTemplateRef,
  watch,
} from 'vue'
import { useFocusTrap } from '@/composables/useFocusTrap'
import { usePortal } from '@/composables/usePortal'
import { useVaporTransition } from '@/composables/useVaporTransition'
import { useUiStore } from '@/stores/ui'
import { extractThemeVars } from '@/utils/themeVars'
import MkReactionPicker from './MkReactionPicker.vue'

const props = defineProps<{
  serverHost: string
  accountId: string
}>()

const emit = defineEmits<{
  pick: [reaction: string]
}>()

const $style = useCssModule()
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
  enterDuration: 200,
  leaveDuration: 200,
})

const backdropClass = computed(() => [
  $style.popupBackdrop,
  isCompact.value && $style.mobile,
  isCompact.value && (leaving.value ? $style.sheetLeave : $style.sheetEnter),
])

const contentClass = computed(() => [
  $style.reactionPickerPopup,
  leaving.value
    ? isCompact.value
      ? $style.sheetContentLeave
      : $style.popupContentLeave
    : isCompact.value
      ? $style.sheetContentEnter
      : $style.popupContentEnter,
])

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

const pickerPortalRef = useTemplateRef<HTMLElement>('pickerPortalRef')
usePortal(pickerPortalRef)

defineExpose({ open })
</script>

<template>
  <div
    v-if="visible"
    ref="pickerPortalRef"
    :class="backdropClass"
    @click="close"
  >
    <div
      ref="pickerRef"
      :class="contentClass"
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
</template>

<style lang="scss" module>
.popupBackdrop {
  position: fixed;
  inset: 0;
  z-index: var(--nd-z-popup);
  background: transparent;

  &.mobile {
    background: rgba(0, 0, 0, 0.4);
  }
}

.reactionPickerPopup {
  position: fixed;
  transform: translateX(-100%);
  z-index: calc(var(--nd-z-popup) + 1);
  background: color-mix(in srgb, var(--nd-popup, var(--nd-panel)) 96%, transparent);
  border-radius: 12px;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.3);
  overflow: hidden;
  contain: layout paint;

  .mobile & {
    transform: none;
    top: auto;
    left: 0;
    right: 0;
    bottom: 0;
    width: 100%;
    border-radius: 16px 16px 0 0;
    box-shadow: 0 -4px 24px rgba(0, 0, 0, 0.3);
    padding-bottom: var(--nd-safe-area-bottom, env(safe-area-inset-bottom));
  }
}

/* Desktop popup content — scale + fade */
.popupContentEnter { animation: reactionPickerIn 0.2s var(--nd-ease-spring); }
.popupContentLeave { animation: reactionPickerOut var(--nd-duration-fast) var(--nd-ease-decel) forwards; }
@keyframes reactionPickerIn { from { opacity: 0; transform: translateX(-100%) scale(0.85); } }
@keyframes reactionPickerOut { to { opacity: 0; transform: translateX(-100%) scale(0.9); } }

/* Mobile sheet backdrop */
.sheetEnter { animation: sheetBdIn var(--nd-duration-base) var(--nd-ease-decel); }
.sheetLeave { animation: sheetBdOut var(--nd-duration-base) ease-out forwards; }
@keyframes sheetBdIn { from { opacity: 0; } }
@keyframes sheetBdOut { to { opacity: 0; } }

/* Mobile sheet content — slide up from bottom */
.sheetContentEnter { animation: sheetIn 0.25s var(--nd-ease-spring); }
.sheetContentLeave { animation: sheetOut 0.2s var(--nd-ease-decel) forwards; }
@keyframes sheetIn { from { transform: translateY(100%); } }
@keyframes sheetOut { to { transform: translateY(100%); } }

</style>
