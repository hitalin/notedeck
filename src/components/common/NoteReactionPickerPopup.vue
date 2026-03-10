<script setup lang="ts">
import { defineAsyncComponent, ref } from 'vue'
import { useUiStore } from '@/stores/ui'
import { extractThemeVars } from '@/utils/themeVars'

const MkReactionPicker = defineAsyncComponent(
  () => import('./MkReactionPicker.vue'),
)

const props = defineProps<{
  serverHost: string
  pinnedEmojis?: string[]
}>()

const emit = defineEmits<{
  pick: [reaction: string]
}>()

const { isMobile } = useUiStore()
const show = ref(false)
const pos = ref({ x: 0, y: 0 })
const theme = ref<Record<string, string>>({})

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
    <Transition :name="isMobile ? 'nd-sheet' : 'nd-popup'">
      <div v-if="show" class="popup-backdrop" :class="{ mobile: isMobile }" @click="close">
        <div
          class="reaction-picker-popup"
          :style="isMobile ? theme : { ...theme, top: pos.y + 'px', left: pos.x + 'px' }"
          @click.stop
        >
          <MkReactionPicker
            :server-host="serverHost"
            :pinned-emojis="pinnedEmojis"
            @pick="(r: string) => { emit('pick', r); close() }"
          />
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.popup-backdrop {
  position: fixed;
  inset: 0;
  z-index: 10000;
  background: transparent;
}

.popup-backdrop.mobile {
  background: rgba(0, 0, 0, 0.4);
  display: flex;
  align-items: flex-end;
}

.reaction-picker-popup {
  position: fixed;
  transform: translateX(-100%);
  z-index: 10001;
  background: color-mix(in srgb, var(--nd-popup, var(--nd-panel)) 85%, transparent);
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
  border-radius: 12px;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.3);
  overflow: hidden;
}

.mobile .reaction-picker-popup {
  position: static;
  transform: none;
  width: 100%;
  border-radius: 16px 16px 0 0;
  box-shadow: 0 -4px 24px rgba(0, 0, 0, 0.3);
  padding-bottom: var(--nd-safe-area-bottom, env(safe-area-inset-bottom));
}

/* Desktop popup transition */
.nd-popup-enter-active,
.nd-popup-leave-active {
  transition: opacity 0.15s ease;
}

.nd-popup-enter-active .reaction-picker-popup,
.nd-popup-leave-active .reaction-picker-popup {
  transition: opacity 0.2s cubic-bezier(0, 0, 0.2, 1), transform 0.2s cubic-bezier(0, 0, 0.2, 1);
}

.nd-popup-enter-from,
.nd-popup-leave-to {
  opacity: 0;
}

.nd-popup-enter-from .reaction-picker-popup,
.nd-popup-leave-to .reaction-picker-popup {
  transform: translateX(-100%) scale(0.95);
}

/* Mobile bottom-sheet transition */
.nd-sheet-enter-active,
.nd-sheet-leave-active {
  transition: opacity 0.2s ease;
}

.nd-sheet-enter-active .reaction-picker-popup,
.nd-sheet-leave-active .reaction-picker-popup {
  transition: transform 0.3s cubic-bezier(0.16, 1, 0.3, 1);
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
