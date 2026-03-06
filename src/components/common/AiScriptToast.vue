<script setup lang="ts">
import { ref } from 'vue'

export interface ToastItem {
  id: number
  text: string
  type: 'info' | 'success' | 'warning' | 'error'
}

const toasts = ref<ToastItem[]>([])
let nextId = 0

function show(text: string, type: ToastItem['type'] = 'info') {
  const id = nextId++
  toasts.value.push({ id, text, type })
  setTimeout(() => {
    toasts.value = toasts.value.filter((t) => t.id !== id)
  }, 3000)
}

defineExpose({ show })
</script>

<template>
  <Teleport to="body">
    <TransitionGroup name="toast" tag="div" class="ais-toast-container">
      <div
        v-for="toast in toasts"
        :key="toast.id"
        class="ais-toast"
        :class="toast.type"
      >
        {{ toast.text }}
      </div>
    </TransitionGroup>
  </Teleport>
</template>

<style scoped>
.ais-toast-container {
  position: fixed;
  top: 16px;
  right: 16px;
  z-index: 10000;
  display: flex;
  flex-direction: column;
  gap: 8px;
  pointer-events: none;
}

.ais-toast {
  padding: 10px 16px;
  border-radius: 8px;
  font-size: 0.85em;
  color: #fff;
  background: var(--nd-accent);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
  pointer-events: auto;
}

.ais-toast.success {
  background: #86b300;
}

.ais-toast.warning {
  background: #e2a100;
}

.ais-toast.error {
  background: #e36749;
}

.toast-enter-active {
  transition: all 0.2s ease;
}

.toast-leave-active {
  transition: all 0.15s ease;
}

.toast-enter-from {
  opacity: 0;
  transform: translateX(20px);
}

.toast-leave-to {
  opacity: 0;
  transform: translateX(20px);
}
</style>
