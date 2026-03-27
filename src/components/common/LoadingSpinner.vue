<script setup lang="ts">
withDefaults(
  defineProps<{
    size?: number
  }>(),
  { size: 28 },
)
</script>

<template>
  <div
    :class="$style.spinner"
    :style="{ width: `${size}px`, height: `${size}px` }"
  />
</template>

<style module lang="scss">
.spinner {
  border: 3px solid color-mix(in srgb, var(--nd-accent) 25%, transparent);
  border-top-color: var(--nd-accent);
  border-radius: 50%;
  animation: nd-spin 0.8s linear infinite;
}
</style>
