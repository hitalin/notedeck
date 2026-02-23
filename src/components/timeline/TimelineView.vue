<script setup lang="ts">
import type { NormalizedNote } from '@/adapters/types'
import MkNote from '@/components/common/MkNote.vue'

defineProps<{
  notes: NormalizedNote[]
  isLoading: boolean
}>()

defineEmits<{
  loadMore: []
}>()
</script>

<template>
  <div class="timeline">
    <div v-if="isLoading && notes.length === 0" class="loading">
      Loading timeline...
    </div>

    <template v-else>
      <MkNote v-for="note in notes" :key="note.id" :note="note" />

      <div v-if="notes.length > 0" class="load-more">
        <button :disabled="isLoading" @click="$emit('loadMore')">
          {{ isLoading ? 'Loading...' : 'Load more' }}
        </button>
      </div>

      <div v-if="notes.length === 0 && !isLoading" class="empty">
        No notes yet
      </div>
    </template>
  </div>
</template>

<style scoped>
.timeline {
  width: 100%;
  max-width: 600px;
  margin: 0 auto;
}

.loading,
.empty {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 2rem;
  color: var(--color-text-secondary, #888);
}

.load-more {
  display: flex;
  justify-content: center;
  padding: 1rem;
}

.load-more button {
  padding: 0.5rem 1.5rem;
  border: 1px solid var(--color-border, #333);
  border-radius: 0.5rem;
  background: transparent;
  color: var(--color-text, #fff);
  cursor: pointer;
}

.load-more button:hover:not(:disabled) {
  background: var(--color-bg-secondary, #222);
}

.load-more button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
</style>
