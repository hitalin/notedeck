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
  <div :class="$style.mkPoll">
    <div
      v-for="(choice, i) in poll.choices"
      :key="i"
      :class="[$style.pollChoice, { [$style.voted]: choice.isVoted }]"
    >
      <div :class="$style.pollBar" :style="{ width: `${percentage(choice.votes)}%` }" />
      <div :class="$style.pollContent">
        <span :class="$style.pollText">{{ choice.text }}</span>
        <span :class="$style.pollPct">{{ percentage(choice.votes) }}%</span>
      </div>
      <svg v-if="choice.isVoted" :class="$style.pollCheck" viewBox="0 0 24 24" width="14" height="14">
        <path d="M20 6L9 17l-5-5" stroke="currentColor" stroke-width="2.5" fill="none" stroke-linecap="round" stroke-linejoin="round" />
      </svg>
    </div>
    <div :class="$style.pollFooter">
      <span :class="$style.pollTotal">{{ totalVotes }}票</span>
      <span v-if="poll.multiple" :class="$style.pollBadge">複数選択</span>
      <span v-if="poll.expiresAt" :class="$style.pollExpiry">
        {{ isExpired ? '終了' : `${formatExpiry(poll.expiresAt)}まで` }}
      </span>
    </div>
  </div>
</template>

<style lang="scss" module>
.mkPoll {
  margin-top: 8px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.pollChoice {
  position: relative;
  border-radius: var(--nd-radius-sm);
  overflow: hidden;
  background: var(--nd-buttonBg);
  min-height: 35px;
  display: flex;
  align-items: center;

  &.voted .pollBar {
    background: var(--nd-accent);
    opacity: 0.3;
  }
}

.pollBar {
  position: absolute;
  top: 0;
  left: 0;
  height: 100%;
  background: var(--nd-accentedBg);
  transition: width var(--nd-duration-slower) ease;
}

.pollContent {
  position: relative;
  z-index: 1;
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  padding: 4px 12px;
}

.pollText {
  font-size: 0.9em;
}

.pollPct {
  font-size: 0.8em;
  font-weight: bold;
  opacity: 0.7;
  flex-shrink: 0;
  margin-left: 8px;
}

.pollCheck {
  position: absolute;
  right: 10px;
  color: var(--nd-accent);
  z-index: 1;
}

.pollFooter {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 2px 4px;
  font-size: 0.75em;
  opacity: 0.6;
}

.pollBadge {
  padding: 1px 6px;
  border-radius: var(--nd-radius-full);
  background: var(--nd-buttonBg);
  font-weight: bold;
}

.pollExpiry {
  margin-left: auto;
}
</style>
