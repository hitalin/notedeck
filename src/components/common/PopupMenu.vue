<script setup lang="ts">
import { nextTick, ref, watch } from 'vue'

import { useMenuKeyboard } from '@/composables/useMenuKeyboard'
import { extractThemeVars } from '@/utils/themeVars'

const props = withDefaults(
  defineProps<{
    menuWidth?: number
    menuHeight?: number
  }>(),
  { menuWidth: 250, menuHeight: 400 },
)

const emit = defineEmits<{
  close: []
}>()

const showMenu = ref(false)
const menuPos = ref({ x: 0, y: 0 })
const menuTheme = ref<Record<string, string>>({})
const menuRef = ref<HTMLElement | null>(null)

const { activate: activateKeyboard, deactivate: deactivateKeyboard } =
  useMenuKeyboard({
    containerRef: menuRef,
    itemSelector: 'button',
    onClose: () => close(),
  })

watch(showMenu, (v) => {
  if (v) nextTick(activateKeyboard)
  else deactivateKeyboard()
})

function open(e: MouseEvent) {
  const el = e.currentTarget as HTMLElement | null
  const column = (el ?? (e.target as HTMLElement))?.closest(
    '.deck-column',
  ) as HTMLElement | null
  if (column) menuTheme.value = extractThemeVars(column)

  let x = e.clientX
  let y = e.clientY
  const vw = document.documentElement.clientWidth
  const vh = document.documentElement.clientHeight

  if (x + props.menuWidth > vw) {
    x = vw - props.menuWidth - 8
  }
  if (y + props.menuHeight > vh) {
    y = Math.max(8, y - props.menuHeight)
  }
  x = Math.max(8, x)
  y = Math.max(8, y)

  menuPos.value = { x, y }
  showMenu.value = true
}

function close() {
  showMenu.value = false
  emit('close')
}

defineExpose({ open, close, activateKeyboard })
</script>

<template>
  <Teleport to="body">
    <Transition name="nd-popup">
      <div v-if="showMenu" :class="$style.popupBackdrop" @click="close">
        <div
          ref="menuRef"
          :class="$style.popupMenu"
          class="_popup nd-popup-content popup-menu"
          :style="{ ...menuTheme, top: menuPos.y + 'px', left: menuPos.x + 'px' }"
          @click.stop
        >
          <slot />
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
}

.popupMenu {
  position: fixed;
  min-width: 200px;
  max-width: 300px;
  padding: 6px 0;
  z-index: calc(var(--nd-z-popup) + 1);
}
</style>
