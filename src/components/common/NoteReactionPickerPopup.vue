<script setup lang="ts">
import { defineAsyncComponent, ref } from 'vue'
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
    <Transition name="nd-popup">
      <div v-if="show" class="popup-backdrop" @click="close">
        <div
          class="reaction-picker-popup"
          :style="{ ...theme, top: pos.y + 'px', left: pos.x + 'px' }"
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

.reaction-picker-popup {
  position: fixed;
  transform: translateX(-100%);
  z-index: 10001;
}

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
</style>
