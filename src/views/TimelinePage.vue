<script setup lang="ts">
import { computed, onMounted, ref, shallowRef } from 'vue'
import type { TimelineType } from '@/adapters/types'
import TimelineView from '@/components/timeline/TimelineView.vue'
import UnifiedTimeline from '@/components/timeline/UnifiedTimeline.vue'
import { useTimeline } from '@/composables/useTimeline'
import { useUnifiedTimeline } from '@/composables/useUnifiedTimeline'
import { useAccountsStore } from '@/stores/accounts'
import { useTimelinesStore } from '@/stores/timelines'

const accountsStore = useAccountsStore()
const timelinesStore = useTimelinesStore()

const timelineType = ref<TimelineType>('home')
const viewMode = ref<'single' | 'unified'>('single')
const error = ref<string | null>(null)

const account = computed(() => accountsStore.activeAccount)

const timeline = computed(() => {
  if (!account.value) return null
  return timelinesStore.perServer.get(account.value.id) ?? null
})

const hasMultipleAccounts = computed(() => accountsStore.accounts.length > 1)

const singleTimeline = shallowRef<ReturnType<typeof useTimeline> | null>(null)
const unifiedTl = shallowRef<ReturnType<typeof useUnifiedTimeline> | null>(null)

onMounted(async () => {
  if (!account.value) return

  if (hasMultipleAccounts.value) {
    viewMode.value = 'unified'
    unifiedTl.value = useUnifiedTimeline(accountsStore.accounts)
    await unifiedTl.value.connectAll(timelineType.value)
  } else {
    singleTimeline.value = useTimeline(account.value)
    try {
      await singleTimeline.value.connect(timelineType.value)
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'Failed to load timeline'
    }
  }
})

function handleLoadMore() {
  singleTimeline.value?.loadMore()
}

const TIMELINE_TYPES: { type: TimelineType; label: string }[] = [
  { type: 'home', label: 'Home' },
  { type: 'local', label: 'Local' },
  { type: 'social', label: 'Social' },
  { type: 'global', label: 'Global' },
]

async function switchTimeline(type: TimelineType) {
  timelineType.value = type
  error.value = null

  if (viewMode.value === 'unified' && unifiedTl.value) {
    unifiedTl.value.disconnectAll()
    await unifiedTl.value.connectAll(type)
  } else if (singleTimeline.value && account.value) {
    singleTimeline.value.disconnect()
    try {
      await singleTimeline.value.connect(type)
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'Failed to load timeline'
    }
  }
}

function toggleViewMode() {
  if (viewMode.value === 'single') {
    viewMode.value = 'unified'
    singleTimeline.value?.disconnect()
    singleTimeline.value = null
    unifiedTl.value = useUnifiedTimeline(accountsStore.accounts)
    unifiedTl.value.connectAll(timelineType.value)
  } else {
    viewMode.value = 'single'
    unifiedTl.value?.disconnectAll()
    unifiedTl.value = null
    if (account.value) {
      singleTimeline.value = useTimeline(account.value)
      singleTimeline.value.connect(timelineType.value)
    }
  }
}
</script>

<template>
  <div class="timeline-page">
    <header class="tl-header">
      <router-link to="/" class="back">notedeck</router-link>
      <nav class="tl-tabs">
        <button
          v-for="t in TIMELINE_TYPES"
          :key="t.type"
          :class="{ active: timelineType === t.type }"
          @click="switchTimeline(t.type)"
        >
          {{ t.label }}
        </button>
      </nav>
      <button
        v-if="hasMultipleAccounts"
        class="mode-toggle"
        :class="{ active: viewMode === 'unified' }"
        @click="toggleViewMode"
      >
        {{ viewMode === 'unified' ? 'Unified' : 'Single' }}
      </button>
      <span v-if="account && viewMode === 'single'" class="account-badge">
        @{{ account.username }}@{{ account.host }}
      </span>
    </header>

    <div v-if="error" class="error">
      <p>{{ error }}</p>
      <button @click="error = null">Dismiss</button>
    </div>

    <div v-if="!account" class="no-account">
      <p>No account selected.</p>
      <router-link to="/login">Add an account</router-link>
    </div>

    <template v-else>
      <UnifiedTimeline
        v-if="viewMode === 'unified' && unifiedTl"
        :notes="unifiedTl.unified"
        :is-loading="unifiedTl.isConnecting.value"
        :errors="unifiedTl.errors.value"
      />

      <TimelineView
        v-else-if="timeline"
        :notes="timeline.notes"
        :is-loading="timeline.isLoading"
        @load-more="handleLoadMore"
      />
    </template>
  </div>
</template>

<style scoped>
.timeline-page {
  display: flex;
  flex-direction: column;
  min-height: 100vh;
}

.tl-header {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.75rem 1rem;
  border-bottom: 1px solid var(--color-border, #333);
  position: sticky;
  top: 0;
  background: var(--color-bg, #1a1a1a);
  z-index: 10;
}

.back {
  font-weight: bold;
  text-decoration: none;
  color: var(--color-accent, #86b300);
}

.tl-tabs {
  display: flex;
  gap: 0.25rem;
}

.tl-tabs button {
  padding: 0.375rem 0.75rem;
  border: none;
  border-radius: 0.375rem;
  background: transparent;
  color: var(--color-text-secondary, #888);
  cursor: pointer;
  font-size: 0.875rem;
}

.tl-tabs button.active {
  background: var(--color-accent, #86b300);
  color: #fff;
}

.tl-tabs button:hover:not(.active) {
  background: var(--color-bg-secondary, #222);
}

.mode-toggle {
  padding: 0.25rem 0.5rem;
  border: 1px solid var(--color-border, #333);
  border-radius: 0.375rem;
  background: transparent;
  color: var(--color-text-secondary, #888);
  cursor: pointer;
  font-size: 0.75rem;
}

.mode-toggle.active {
  border-color: var(--color-accent, #86b300);
  color: var(--color-accent, #86b300);
}

.account-badge {
  margin-left: auto;
  font-size: 0.75rem;
  color: var(--color-text-secondary, #888);
}

.error {
  padding: 1rem;
  background: #3d1414;
  color: #e74c3c;
  display: flex;
  align-items: center;
  gap: 1rem;
}

.error button {
  padding: 0.25rem 0.75rem;
  border: 1px solid currentColor;
  border-radius: 0.25rem;
  background: transparent;
  color: inherit;
  cursor: pointer;
}

.no-account {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 3rem;
  gap: 1rem;
}
</style>
