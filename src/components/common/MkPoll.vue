<script setup lang="ts">
import { computed } from 'vue'
import type { NormalizedPoll } from '@/adapters/types'

const props = defineProps<{
  poll: NormalizedPoll
}>()

const totalVotes = computed(() =>
  props.poll.choices.reduce((sum, c) => sum + c.votes, 0),
)

const isExpired = computed(() => {
  if (!props.poll.expiresAt) return false
  return new Date(props.poll.expiresAt) < new Date()
})

function percentage(votes: number): number {
  if (totalVotes.value === 0) return 0
  return Math.round((votes / totalVotes.value) * 100)
}

function formatExpiry(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleString()
}
</script>

<template>
  <div class="mk-poll">
    <div
      v-for="(choice, i) in poll.choices"
      :key="i"
      class="poll-choice"
      :class="{ voted: choice.isVoted }"
    >
      <div class="poll-bar" :style="{ width: `${percentage(choice.votes)}%` }" />
      <div class="poll-content">
        <span class="poll-text">{{ choice.text }}</span>
        <span class="poll-pct">{{ percentage(choice.votes) }}%</span>
      </div>
      <svg v-if="choice.isVoted" class="poll-check" viewBox="0 0 24 24" width="14" height="14">
        <path d="M20 6L9 17l-5-5" stroke="currentColor" stroke-width="2.5" fill="none" stroke-linecap="round" stroke-linejoin="round" />
      </svg>
    </div>
    <div class="poll-footer">
      <span class="poll-total">{{ totalVotes }} votes</span>
      <span v-if="poll.multiple" class="poll-badge">Multiple choice</span>
      <span v-if="poll.expiresAt" class="poll-expiry">
        {{ isExpired ? 'Ended' : `Until ${formatExpiry(poll.expiresAt)}` }}
      </span>
    </div>
  </div>
</template>

<style scoped>
.mk-poll {
  margin-top: 8px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.poll-choice {
  position: relative;
  border-radius: 6px;
  overflow: hidden;
  background: var(--nd-buttonBg);
  min-height: 36px;
  display: flex;
  align-items: center;
}

.poll-bar {
  position: absolute;
  top: 0;
  left: 0;
  height: 100%;
  background: var(--nd-accentedBg);
  transition: width 0.3s ease;
}

.poll-choice.voted .poll-bar {
  background: var(--nd-accent);
  opacity: 0.3;
}

.poll-content {
  position: relative;
  z-index: 1;
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  padding: 8px 12px;
}

.poll-text {
  font-size: 0.9em;
}

.poll-pct {
  font-size: 0.8em;
  font-weight: bold;
  opacity: 0.7;
  flex-shrink: 0;
  margin-left: 8px;
}

.poll-check {
  position: absolute;
  right: 10px;
  color: var(--nd-accent);
  z-index: 1;
}

.poll-footer {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 2px 4px;
  font-size: 0.75em;
  opacity: 0.6;
}

.poll-badge {
  padding: 1px 6px;
  border-radius: 999px;
  background: var(--nd-buttonBg);
  font-weight: bold;
}

.poll-expiry {
  margin-left: auto;
}
</style>
