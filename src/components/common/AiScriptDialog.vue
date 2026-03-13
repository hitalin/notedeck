<script setup lang="ts">
import { ref } from 'vue'

const visible = ref(false)
const title = ref('')
const text = ref('')
const dialogType = ref<'info' | 'success' | 'warning' | 'error'>('info')
const mode = ref<'dialog' | 'confirm'>('dialog')

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
  visible.value = true
  return new Promise((resolve) => {
    resolvePromise = () => resolve()
  })
}

function showConfirm(t: string, tx: string): Promise<boolean> {
  title.value = t
  text.value = tx
  dialogType.value = 'info'
  mode.value = 'confirm'
  visible.value = true
  return new Promise((resolve) => {
    resolvePromise = resolve
  })
}

function close(result: boolean) {
  visible.value = false
  resolvePromise?.(result)
  resolvePromise = null
}

defineExpose({ showDialog, showConfirm })
</script>

<template>
  <Teleport to="body">
    <Transition name="dialog-fade">
      <div v-if="visible" class="ais-dialog-backdrop" @click.self="close(false)">
        <div class="ais-dialog" :class="dialogType">
          <div v-if="title" class="ais-dialog-title">{{ title }}</div>
          <div v-if="text" class="ais-dialog-text">{{ text }}</div>
          <div class="ais-dialog-actions">
            <template v-if="mode === 'confirm'">
              <button class="ais-dialog-btn cancel" @click="close(false)">
                キャンセル
              </button>
              <button class="ais-dialog-btn ok" @click="close(true)">OK</button>
            </template>
            <template v-else>
              <button class="ais-dialog-btn ok" @click="close(true)">OK</button>
            </template>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.ais-dialog-backdrop {
  position: fixed;
  inset: 0;
  z-index: var(--nd-z-popup);
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--nd-modalBg);
}

.ais-dialog {
  min-width: 280px;
  max-width: 400px;
  padding: 20px;
  border-radius: 12px;
  background: var(--nd-panel);
  color: var(--nd-fg);
  box-shadow: 0 4px 24px rgba(0, 0, 0, 0.3);
}

.ais-dialog-title {
  font-size: 1em;
  font-weight: 600;
  margin-bottom: 8px;
}

.ais-dialog.warning .ais-dialog-title {
  color: var(--nd-warn);
}

.ais-dialog.error .ais-dialog-title {
  color: var(--nd-error);
}

.ais-dialog.success .ais-dialog-title {
  color: var(--nd-success);
}

.ais-dialog-text {
  font-size: 0.9em;
  line-height: 1.5;
  opacity: 0.85;
  white-space: pre-wrap;
}

.ais-dialog-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 16px;
}

.ais-dialog-btn {
  padding: 6px 16px;
  border: none;
  border-radius: var(--nd-radius-sm);
  font-size: 0.85em;
  cursor: pointer;
  transition: opacity 0.15s;
}

.ais-dialog-btn:hover {
  opacity: 0.85;
}

.ais-dialog-btn.ok {
  background: var(--nd-accent);
  color: var(--nd-fgOnAccent);
}

.ais-dialog-btn.cancel {
  background: var(--nd-buttonBg);
  color: var(--nd-fg);
}

.dialog-fade-enter-active {
  transition: opacity 0.15s ease;
}

.dialog-fade-leave-active {
  transition: opacity var(--nd-duration-fast) ease;
}

.dialog-fade-enter-from,
.dialog-fade-leave-to {
  opacity: 0;
}
</style>
