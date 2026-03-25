<script setup lang="ts">
import { ref } from 'vue'

import { useVaporTransition } from '@/composables/useVaporTransition'

const show = ref(false)
const title = ref('')
const text = ref('')
const dialogType = ref<'info' | 'success' | 'warning' | 'error'>('info')
const mode = ref<'dialog' | 'confirm'>('dialog')

const { visible, entering, leaving } = useVaporTransition(show, {
  enterDuration: 300,
  leaveDuration: 300,
})

let resolvePromise: ((value: boolean) => void) | null = null

function showDialog(
  t: string,
  tx: string,
  type: 'info' | 'success' | 'warning' | 'error' = 'info',
): Promise<void> {
  title.value = t
  text.value = tx
  dialogType.value = type
  mode.value = 'dialog'
  show.value = true
  return new Promise((resolve) => {
    resolvePromise = () => resolve()
  })
}

function showConfirm(t: string, tx: string): Promise<boolean> {
  title.value = t
  text.value = tx
  dialogType.value = 'info'
  mode.value = 'confirm'
  show.value = true
  return new Promise((resolve) => {
    resolvePromise = resolve
  })
}

function close(result: boolean) {
  show.value = false
  resolvePromise?.(result)
  resolvePromise = null
}

defineExpose({ showDialog, showConfirm })
</script>

<template>
  <Teleport to="body">
    <div
      v-if="visible"
      class="_dialogBackdrop"
      :class="[$style.aisBackdrop, entering && $style.enter, leaving && $style.leave]"
      @click.self="close(false)"
    >
      <div
        :class="[$style.aisDialog, $style[dialogType], entering && $style.contentEnter, leaving && $style.contentLeave]"
        class="nd-popup-content"
      >
        <div v-if="title" :class="$style.aisDialogTitle">{{ title }}</div>
        <div v-if="text" :class="$style.aisDialogText">{{ text }}</div>
        <div :class="$style.aisDialogActions">
          <template v-if="mode === 'confirm'">
            <button :class="[$style.aisDialogBtn, $style.cancel]" @click="close(false)">
              キャンセル
            </button>
            <button :class="[$style.aisDialogBtn, $style.ok]" @click="close(true)">OK</button>
          </template>
          <template v-else>
            <button :class="[$style.aisDialogBtn, $style.ok]" @click="close(true)">OK</button>
          </template>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style lang="scss" module>
.aisBackdrop {
  z-index: var(--nd-z-popup);
  background: var(--nd-modalBg);
}

.aisDialog {
  min-width: 320px;
  max-width: 480px;
  padding: 32px;
  border-radius: 16px;
  background: var(--nd-panel);
  color: var(--nd-fg);
  box-shadow: 0 4px 24px rgba(0, 0, 0, 0.3);

  &.warning .aisDialogTitle {
    color: var(--nd-warn);
  }

  &.error .aisDialogTitle {
    color: var(--nd-error);
  }

  &.success .aisDialogTitle {
    color: var(--nd-success);
  }
}

.aisDialogTitle {
  font-size: 1.1em;
  font-weight: bold;
  margin-bottom: 8px;
}

.aisDialogText {
  font-size: 0.9em;
  line-height: 1.5;
  opacity: 0.85;
  white-space: pre-wrap;
}

.aisDialogActions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 16px;
}

.aisDialogBtn {
  padding: 6px 16px;
  border: none;
  border-radius: var(--nd-radius-sm);
  font-size: 0.85em;
  cursor: pointer;
  transition: opacity var(--nd-duration-base);

  &:hover {
    opacity: 0.85;
  }

  &.ok {
    background: var(--nd-accent);
    color: var(--nd-fgOnAccent);
  }

  &.cancel {
    background: var(--nd-buttonBg);
    color: var(--nd-fg);
  }
}

// Keep dialog type classes for dynamic binding
.info {}
.success {}
.warning {}
.error {}

// Vapor transition classes
.enter {
  animation: backdropIn 0.15s ease;
}
.leave {
  animation: backdropOut 0.15s ease forwards;
}
@keyframes backdropIn {
  from { opacity: 0; }
}
@keyframes backdropOut {
  to { opacity: 0; }
}

.contentEnter {
  animation: popupIn 0.3s var(--nd-ease-pop);
}
.contentLeave {
  animation: popupOut 0.15s ease forwards;
}
@keyframes popupIn {
  from { opacity: 0; transform: scale(0.95); }
}
@keyframes popupOut {
  to { opacity: 0; transform: scale(0.95); }
}
</style>

