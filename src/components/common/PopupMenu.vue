<script setup lang="ts">
import { nextTick, ref, watch } from 'vue'

import { useMenuKeyboard } from '@/composables/useMenuKeyboard'
import { useNativePopover } from '@/composables/useNativePopover'
import { useVaporTransition } from '@/composables/useVaporTransition'
import { COLUMN_SELECTOR, extractThemeVars } from '@/utils/themeVars'

const emit = defineEmits<{
  close: []
}>()

const showMenu = ref(false)
const menuPos = ref({ x: 0, y: 0 })
const menuTheme = ref<Record<string, string>>({})
const menuRef = ref<HTMLElement | null>(null)
const triggerRef = ref<HTMLElement | null>(null)

const { visible, entering, leaving } = useVaporTransition(showMenu, {
  enterDuration: 200,
  leaveDuration: 200,
})

const { activate: activateKeyboard, deactivate: deactivateKeyboard } =
  useMenuKeyboard({
    containerRef: menuRef,
    itemSelector: 'button',
    onClose: () => close(),
  })

watch(visible, (v) => {
  if (v) nextTick(activateKeyboard)
  else deactivateKeyboard()
})

useNativePopover(menuRef, visible, {
  onClose: () => close(),
  leaveDuration: 200,
  dismissOnOutsideClick: true,
  ignoreOutsideClickFor: triggerRef,
})

function open(e: MouseEvent) {
  const el = e.currentTarget as HTMLElement | null
  triggerRef.value = el
  // 同じトリガー再押下はトグル (close)
  if (showMenu.value) {
    close()
    return
  }
  const column = (el ?? (e.target as HTMLElement))?.closest(
    COLUMN_SELECTOR,
  ) as HTMLElement | null
  if (column) menuTheme.value = extractThemeVars(column)

  // 押下点に被ると最初のメニュー項目を誤タップしやすいので少し下にずらす
  menuPos.value = { x: e.clientX + 4, y: e.clientY + 10 }
  showMenu.value = true

  nextTick(() => {
    const menu = menuRef.value
    if (!menu) return
    const rect = menu.getBoundingClientRect()
    const vw = document.documentElement.clientWidth
    const vh = document.documentElement.clientHeight
    let { x, y } = menuPos.value
    if (x + rect.width > vw) x = Math.max(8, vw - rect.width - 8)
    if (y + rect.height > vh) y = Math.max(8, vh - rect.height - 8)
    menuPos.value = { x, y }
  })
}

function close() {
  showMenu.value = false
  emit('close')
}

defineExpose({ open, close, activateKeyboard })
</script>

<template>
    <div
      v-if="visible"
      ref="menuRef"
      popover="manual"
      :class="[$style.popupMenu, entering && $style.contentEnter, leaving && $style.contentLeave]"
      class="_popup nd-popup-content popup-menu"
      :style="{ ...menuTheme, top: menuPos.y + 'px', left: menuPos.x + 'px' }"
    >
      <slot />
    </div>
</template>

<style lang="scss" module>
@use '@/styles/popup';

.popupMenu {
  position: fixed;
  min-width: 200px;
  max-width: 300px;
  padding: 6px 0;
}

</style>
