<script setup lang="ts">
import DeckLayout from '@/components/deck/DeckLayout.vue'
</script>

<template>
  <div :class="$style.deckPage">
    <DeckLayout />
  </div>
</template>

<style lang="scss" module>
.deckPage {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
  background: var(--nd-deckBg);
  overflow: hidden;
}
</style>
