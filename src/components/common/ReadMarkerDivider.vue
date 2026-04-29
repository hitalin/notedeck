<script setup lang="ts">
withDefaults(
  defineProps<{
    text?: string
  }>(),
  {
    text: 'ここまで読みました',
  },
)
</script>

<template>
  <div :class="$style.root" role="separator" :aria-label="text">
    <span :class="$style.line" aria-hidden="true" />
    <span :class="$style.text">{{ text }}</span>
    <span :class="$style.line" aria-hidden="true" />
  </div>
</template>

<style lang="scss" module>
.root {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 16px;
  color: var(--nd-fg);
  opacity: 0.55;
  font-size: 0.78em;
  user-select: none;
  pointer-events: none;
}

.line {
  flex: 1;
  height: 1px;
  background: var(--nd-divider);
}

.text {
  white-space: nowrap;
  letter-spacing: 0.02em;
}
</style>
