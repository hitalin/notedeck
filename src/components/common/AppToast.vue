<script setup lang="ts">
import { useToast } from '@/stores/toast'

const { toasts } = useToast()
</script>

<template>
  <Teleport to="body">
    <TransitionGroup name="app-toast" tag="div" :class="$style.container">
      <div
        v-for="toast in toasts"
        :key="toast.id"
        :class="[$style.toast, $style[toast.type]]"
      >
        <i
          :class="[
            $style.icon,
            toast.type === 'success' ? 'ti ti-check' :
            toast.type === 'warning' ? 'ti ti-alert-triangle' :
            toast.type === 'error' ? 'ti ti-x' :
            'ti ti-info-circle',
          ]"
        />
        <span :class="$style.text">{{ toast.text }}</span>
      </div>
    </TransitionGroup>
  </Teleport>
</template>

<style lang="scss" module>
.container {
  position: fixed;
  top: 15%;
  left: 50%;
  transform: translateX(-50%);
  z-index: var(--nd-z-popup);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  pointer-events: none;
}

.toast {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 16px;
  border-radius: var(--nd-radius-md);
  font-size: 0.85em;
  color: #fff;
  background: color-mix(in srgb, var(--nd-panel) 80%, transparent);
  backdrop-filter: blur(var(--nd-blur));
  -webkit-backdrop-filter: blur(var(--nd-blur));
  box-shadow: var(--nd-shadow-m);
  pointer-events: auto;
  white-space: nowrap;
  max-width: 90vw;
}

.icon {
  flex-shrink: 0;
  font-size: 1.1em;
}

.text {
  overflow: hidden;
  text-overflow: ellipsis;
}

.success {
  color: #fff;
  background: color-mix(in srgb, var(--nd-success) 90%, transparent);
}

.error {
  color: #fff;
  background: color-mix(in srgb, var(--nd-error) 90%, transparent);
}

.warning {
  color: #fff;
  background: color-mix(in srgb, var(--nd-warn) 85%, transparent);
}

.info {
  color: #fff;
  background: color-mix(in srgb, var(--nd-accent) 85%, transparent);
}
</style>

<style>
.app-toast-enter-active {
  transition:
    opacity var(--nd-duration-slower) var(--nd-ease-pop),
    transform var(--nd-duration-slower) var(--nd-ease-pop);
}

.app-toast-leave-active {
  transition:
    opacity var(--nd-duration-base) ease,
    transform var(--nd-duration-base) ease;
}

.app-toast-enter-from {
  opacity: 0;
  transform: translateY(-12px) scale(0.95);
}

.app-toast-leave-to {
  opacity: 0;
  transform: translateY(8px) scale(0.95);
}
</style>
