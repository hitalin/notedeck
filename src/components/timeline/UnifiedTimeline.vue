<script setup lang="ts">
import type { NormalizedNote } from '@/adapters/types'
import MkNote from '@/components/common/MkNote.vue'

defineProps<{
  notes: NormalizedNote[]
  isLoading: boolean
  errors: Map<string, string>
}>()
</script>

<template>
  <div class="unified-timeline">
    <div v-if="errors.size > 0" class="errors">
      <div v-for="[accountId, msg] in errors" :key="accountId" class="error">
        {{ msg }}
      </div>
    </div>

    <div v-if="isLoading && notes.length === 0" class="loading">
      Connecting to servers...
    </div>

    <template v-else>
      <MkNote v-for="note in notes" :key="`${note._serverHost}:${note.id}`" :note="note" />

      <div v-if="notes.length === 0 && !isLoading" class="empty">
        No notes yet
      </div>
    </template>
  </div>
</template>

<style scoped>
.unified-timeline {
  width: 100%;
  max-width: 600px;
  margin: 0 auto;
}

.errors {
  padding: 0.5rem 1rem;
}

.error {
  padding: 0.5rem;
  margin-bottom: 0.25rem;
  background: #3d1414;
  color: #e74c3c;
  border-radius: 0.25rem;
  font-size: 0.75rem;
}

.loading,
.empty {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 2rem;
  color: var(--color-text-secondary, #888);
}
</style>
