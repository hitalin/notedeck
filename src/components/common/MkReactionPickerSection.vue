<script setup lang="ts">
import { ref } from 'vue'

const props = withDefaults(
  defineProps<{
    label: string
    count?: number
    initialOpen?: boolean
  }>(),
  { initialOpen: true },
)

const isOpen = ref(props.initialOpen)

function toggle() {
  isOpen.value = !isOpen.value
}
</script>

<template>
  <div class="picker-section">
    <button class="section-header" @click="toggle">
      <span class="section-arrow">{{ isOpen ? '▼' : '▶' }}</span>
      <span class="section-label">{{ label }}</span>
      <span v-if="count != null" class="section-count">({{ count }})</span>
    </button>
    <div v-if="isOpen" class="section-content">
      <slot />
    </div>
  </div>
</template>

<style scoped>
.picker-section {
  margin-bottom: 2px;
}

.section-header {
  display: flex;
  align-items: center;
  gap: 4px;
  width: 100%;
  padding: 6px 8px;
  border: none;
  border-radius: var(--nd-radius-sm);
  background: none;
  color: var(--nd-fg);
  font-size: 0.75em;
  font-weight: bold;
  cursor: pointer;
  opacity: 0.7;
  position: sticky;
  top: 0;
  z-index: 1;
  backdrop-filter: blur(var(--nd-blur));
  -webkit-backdrop-filter: blur(var(--nd-blur));
  background: color-mix(in srgb, var(--nd-popup, var(--nd-panel)) 70%, transparent);
}

.section-header:hover {
  opacity: 1;
}

.section-arrow {
  font-size: 0.8em;
  width: 12px;
  flex-shrink: 0;
}

.section-label {
  text-transform: uppercase;
}

.section-count {
  opacity: 0.5;
  font-weight: normal;
}

.section-content {
  padding: 2px 0;
}
</style>
