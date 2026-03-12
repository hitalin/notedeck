<script setup lang="ts">
import DeckLayout from '@/components/deck/DeckLayout.vue'
</script>

<template>
  <div class="deck-page">
    <DeckLayout />
  </div>
</template>

<style scoped>
.deck-page {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--nd-deckBg);
  overflow: hidden;
}
</style>
