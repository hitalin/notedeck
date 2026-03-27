<script setup lang="ts">
import { ref } from 'vue'
import { useVaporTransitionGroup } from '@/composables/useVaporTransition'

export interface ToastItem {
  id: number
  text: string
  type: 'info' | 'success' | 'warning' | 'error'
}

const toasts = ref<ToastItem[]>([])
let nextId = 0

const { rendered, enteringIds, leavingIds } = useVaporTransitionGroup(toasts, {
  enterDuration: 250,
  leaveDuration: 120,
})

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
    <div :class="$style.aisToastContainer">
      <div
        v-for="toast in rendered"
        :key="toast.id"
        :class="[
          $style.aisToast,
          $style[toast.type],
          enteringIds.has(toast.id) && $style.toastEnter,
          leavingIds.has(toast.id) && $style.toastLeave,
        ]"
      >
        {{ toast.text }}
      </div>
    </div>
  </Teleport>
</template>

<style lang="scss" module>
.aisToastContainer {
  position: fixed;
  top: 16px;
  right: 16px;
  z-index: var(--nd-z-popup);
  display: flex;
  flex-direction: column;
  gap: 8px;
  pointer-events: none;
}

.aisToast {
  padding: 10px 16px;
  border-radius: var(--nd-radius-md);
  font-size: 0.85em;
  color: #fff;
  background: var(--nd-accent);
  box-shadow: var(--nd-shadow-s);
  pointer-events: auto;

  &.success {
    background: var(--nd-success);
  }

  &.warning {
    background: var(--nd-warn);
  }

  &.error {
    background: var(--nd-error);
  }
}

// Keep type classes for dynamic binding
.info {}
.success {}
.warning {}
.error {}

.toastEnter {
  animation: ais-toast-enter 0.25s var(--nd-ease-spring) both;
}

.toastLeave {
  animation: ais-toast-leave var(--nd-duration-fast) ease-out both;
}

@keyframes ais-toast-enter {
  from {
    opacity: 0;
    transform: translateX(20px);
  }
}

@keyframes ais-toast-leave {
  to {
    opacity: 0;
    transform: translateX(20px);
  }
}
</style>
