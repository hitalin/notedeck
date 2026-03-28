<template>
  <div :class="$style.spinner" />
</template>

<style module lang="scss">
.spinner {
  width: 28px;
  height: 28px;
  border: 3px solid color-mix(in srgb, var(--nd-accent) 25%, transparent);
  border-top-color: var(--nd-accent);
  border-radius: 50%;
  animation: nd-spin 0.8s linear infinite;
}
</style>
