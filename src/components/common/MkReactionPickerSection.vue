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
  <div :class="$style.pickerSection">
    <button :class="$style.sectionHeader" @click="toggle">
      <span :class="$style.sectionArrow">{{ isOpen ? '▼' : '▶' }}</span>
      <span :class="$style.sectionLabel">{{ label }}</span>
      <span v-if="count != null" :class="$style.sectionCount">({{ count }})</span>
    </button>
    <div v-if="isOpen" :class="$style.sectionContent">
      <slot />
    </div>
  </div>
</template>

<style lang="scss" module>
.pickerSection {
  margin-bottom: 2px;
}

.sectionHeader {
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

  &:hover {
    opacity: 1;
  }
}

.sectionArrow {
  font-size: 0.8em;
  width: 12px;
  flex-shrink: 0;
}

.sectionLabel {
  text-transform: none;
}

.sectionCount {
  opacity: 0.5;
  font-weight: normal;
}

.sectionContent {
  padding: 2px 0;
}
</style>
