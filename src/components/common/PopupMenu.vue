<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'

import { useBackButton } from '@/composables/useBackButton'
import { useMenuKeyboard } from '@/composables/useMenuKeyboard'
import { useNativeDialog } from '@/composables/useNativeDialog'
import { useNativePopover } from '@/composables/useNativePopover'
import { useVaporTransition } from '@/composables/useVaporTransition'
import { useIsCompactLayout } from '@/stores/ui'
import { COLUMN_SELECTOR, extractThemeVars } from '@/utils/themeVars'

const emit = defineEmits<{
  close: []
}>()

const isCompact = useIsCompactLayout()

const showMenu = ref(false)
const menuPos = ref({ x: 0, y: 0 })
const menuTheme = ref<Record<string, string>>({})
// desktop: popover 要素 = メニュー本体 / compact: シート本体 (dialog の子)
const menuRef = ref<HTMLElement | null>(null)
const dialogRef = ref<HTMLDialogElement | null>(null)
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

useNativePopover(
  menuRef,
  computed(() => visible.value && !isCompact.value),
  {
    onClose: () => close(),
    leaveDuration: 200,
    dismissOnOutsideClick: true,
    ignoreOutsideClickFor: triggerRef,
  },
)

// compact のボトムシートは設定メニュー等と同じ dialog ホスト
// (::backdrop の暗転 + navMenu.scss のスライドをそのまま共有)
useNativeDialog(
  dialogRef,
  computed(() => visible.value && isCompact.value),
  {
    onCancel: () => close(),
    leaveDuration: 200,
  },
)

// Android back button / gesture でシートを閉じる
useBackButton(showMenu, () => close())

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

  showMenu.value = true

  // ボトムシート (compact) は下端固定なので位置計算不要
  if (isCompact.value) return

  // 押下点に被ると最初のメニュー項目を誤タップしやすいので少し下にずらす
  menuPos.value = { x: e.clientX + 4, y: e.clientY + 10 }

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
    <!-- compact: 画面下からスライドするボトムシート (設定メニュー等と同じ dialog + navMenu.scss パターン) -->
    <dialog
      v-if="visible && isCompact"
      ref="dialogRef"
      class="_nativeDialog"
      :class="[$style.mobileBackdrop, leaving ? $style.sheetBackdropLeave : $style.sheetBackdropEnter]"
    >
      <div
        ref="menuRef"
        :class="[$style.sheet, leaving ? $style.sheetContentLeave : $style.sheetContentEnter]"
        class="_popup nd-popup-content popup-menu"
        :style="menuTheme"
        @pointerdown.stop
      >
        <slot />
      </div>
    </dialog>
    <!-- desktop: 押下点アンカーのポップアップ -->
    <div
      v-else-if="visible"
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
@use '@/styles/navMenu';

.popupMenu {
  position: fixed;
  min-width: 200px;
  max-width: 300px;
  padding: 6px 0;
}

.sheet {
  width: 100%;
  max-height: 70vh;
  max-height: 70dvh;
  overflow-y: auto;
  overscroll-behavior: contain;
  border-radius: 16px 16px 0 0;
  padding: 8px 0 calc(8px + var(--nd-safe-area-bottom, env(safe-area-inset-bottom)));
}

</style>
