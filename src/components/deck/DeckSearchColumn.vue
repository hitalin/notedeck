<script setup lang="ts">
import { onMounted, onUnmounted, ref, shallowRef, watch } from 'vue'
import { invoke } from '@tauri-apps/api/core'
import { DynamicScroller, DynamicScrollerItem } from 'vue-virtual-scroller'
import DeckColumn from './DeckColumn.vue'
import MkNote from '@/components/common/MkNote.vue'
import MkPostForm from '@/components/common/MkPostForm.vue'
import type { NormalizedNote } from '@/adapters/types'
import { useDeckStore } from '@/stores/deck'
import type { DeckColumn as DeckColumnType } from '@/stores/deck'
import { useColumnSetup } from '@/composables/useColumnSetup'
import { AppError } from '@/utils/errors'

const props = defineProps<{
  column: DeckColumnType
}>()

const deckStore = useDeckStore()
const {
  account,
  columnThemeVars,
  isLoading,
  error,
  initAdapter,
  getAdapter,
  disconnect,
  postForm,
  handlers,
  scroller,
  onScroll,
} = useColumnSetup(() => props.column)

const notes = shallowRef<NormalizedNote[]>([])
const searchQuery = ref(props.column.query ?? '')
const searchInput = ref<HTMLInputElement | null>(null)
const hasLocalResults = ref(false)
const isPreview = ref(false)
const confirmedQuery = ref('')

function mergeNotes(existing: NormalizedNote[], incoming: NormalizedNote[]): NormalizedNote[] {
  const seen = new Set(existing.map(n => n.id))
  const merged = [...existing]
  for (const note of incoming) {
    if (!seen.has(note.id)) {
      merged.push(note)
      seen.add(note.id)
    }
  }
  return merged.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
}

// Incremental local search (typeahead)
let debounceTimer: ReturnType<typeof setTimeout> | null = null

async function searchLocal(q: string) {
  if (!props.column.accountId || !q) return
  try {
    const local = await invoke<NormalizedNote[]>('api_search_notes_local', {
      accountId: props.column.accountId,
      query: q,
      limit: 10,
    })
    // Only update if query hasn't changed since we started
    if (searchQuery.value.trim() === q) {
      notes.value = local
      isPreview.value = true
      hasLocalResults.value = local.length > 0
    }
  } catch {
    // non-critical
  }
}

watch(searchQuery, (val) => {
  const q = val.trim()
  if (debounceTimer) clearTimeout(debounceTimer)
  if (!q) {
    notes.value = []
    isPreview.value = false
    hasLocalResults.value = false
    return
  }
  // Don't show preview if already showing confirmed results for this query
  if (q === confirmedQuery.value) return
  debounceTimer = setTimeout(() => searchLocal(q), 200)
})

async function performSearch() {
  const q = searchQuery.value.trim()
  if (!q) return
  if (debounceTimer) clearTimeout(debounceTimer)

  error.value = null
  isLoading.value = true
  isPreview.value = false
  confirmedQuery.value = q

  deckStore.updateColumn(props.column.id, { query: q })

  // Local search first (instant) if not already showing preview
  if (!hasLocalResults.value && props.column.accountId) {
    try {
      const local = await invoke<NormalizedNote[]>('api_search_notes_local', {
        accountId: props.column.accountId,
        query: q,
      })
      if (local.length > 0) {
        notes.value = local
        hasLocalResults.value = true
      }
    } catch {
      // non-critical
    }
  }

  // Server search
  try {
    const adapter = await initAdapter()
    if (!adapter) return

    const results = await adapter.api.searchNotes(q)
    notes.value = hasLocalResults.value ? mergeNotes(notes.value, results) : results
  } catch (e) {
    if (!hasLocalResults.value) {
      error.value = AppError.from(e)
    }
  } finally {
    isLoading.value = false
  }
}

async function loadMore() {
  const adapter = getAdapter()
  if (!adapter || isLoading.value || notes.value.length === 0) return
  const lastNote = notes.value[notes.value.length - 1]!
  isLoading.value = true
  try {
    const older = await adapter.api.searchNotes(searchQuery.value.trim(), {
      untilId: lastNote.id,
    })
    notes.value = [...notes.value, ...older]
  } catch (e) {
    error.value = AppError.from(e)
  } finally {
    isLoading.value = false
  }
}

function handleScroll() {
  onScroll(loadMore)
}

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Enter') {
    performSearch()
  }
}

onMounted(() => {
  if (searchQuery.value) {
    performSearch()
  } else {
    initAdapter()
    searchInput.value?.focus()
  }
})

onUnmounted(() => {
  if (debounceTimer) clearTimeout(debounceTimer)
  disconnect()
})
</script>

<template>
  <DeckColumn
    :column-id="column.id"
    title="Search"
    :theme-vars="columnThemeVars"
  >
    <template #header-icon>
      <svg class="search-header-icon" viewBox="0 0 24 24" width="14" height="14">
        <path d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" fill="none" />
      </svg>
    </template>

    <template #header-meta>
      <div v-if="account" class="header-account">
        <img v-if="account.avatarUrl" :src="account.avatarUrl" class="header-avatar" />
        <span class="header-host">{{ account.host }}</span>
      </div>
    </template>

    <template #header-extra>
      <div class="search-bar">
        <svg class="search-icon" viewBox="0 0 24 24" width="14" height="14">
          <path d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" fill="none" />
        </svg>
        <input
          ref="searchInput"
          v-model="searchQuery"
          class="search-input"
          type="text"
          placeholder="Search notes..."
          @keydown="onKeydown"
        />
        <button
          class="_button search-btn"
          :disabled="!searchQuery.trim() || isLoading"
          @click="performSearch"
        >
          <svg viewBox="0 0 24 24" width="14" height="14">
            <path d="M5 12h14M12 5l7 7-7 7" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" fill="none" />
          </svg>
        </button>
      </div>
    </template>

    <div v-if="!account" class="column-empty">
      Account not found
    </div>

    <div v-else-if="error" class="column-empty column-error">
      {{ error.message }}
    </div>

    <div v-else class="search-body">
      <div v-if="isLoading && notes.length === 0" class="column-empty">
        Searching...
      </div>

      <div v-else-if="!searchQuery.trim() && notes.length === 0" class="column-empty">
        Enter a search query
      </div>

      <div v-else-if="searchQuery.trim() && !isLoading && !isPreview && notes.length === 0" class="column-empty">
        No results found
      </div>

      <DynamicScroller
        v-else
        ref="scroller"
        class="search-scroller"
        :items="notes"
        :min-item-size="120"
        :buffer="400"
        key-field="id"
        @scroll.passive="handleScroll"
      >
        <template #default="{ item, active, index }">
          <DynamicScrollerItem
            :item="item"
            :active="active"
            :data-index="index"
          >
            <MkNote
              :note="item"
              @react="(reaction: string) => handlers.reaction(item, reaction)"
              @reply="handlers.reply"
              @renote="handlers.renote"
              @quote="handlers.quote"
            />
          </DynamicScrollerItem>
        </template>

        <template #after>
          <div v-if="isPreview && notes.length > 0" class="search-preview-hint">
            Press Enter to search server
          </div>
          <div v-else-if="isLoading && notes.length > 0" class="loading-more">
            {{ hasLocalResults ? 'Searching server...' : 'Loading...' }}
          </div>
        </template>
      </DynamicScroller>
    </div>
  </DeckColumn>

  <Teleport to="body">
    <MkPostForm
      v-if="postForm.show.value && column.accountId"
      :account-id="column.accountId"
      :reply-to="postForm.replyTo.value"
      :renote-id="postForm.renoteId.value"
      @close="postForm.close"
      @posted="postForm.close"
    />
  </Teleport>
</template>

<style scoped>
.search-header-icon {
  flex-shrink: 0;
  opacity: 0.7;
}

.header-account {
  display: flex;
  align-items: center;
  gap: 4px;
  margin-left: 4px;
  flex-shrink: 0;
}

.header-avatar {
  width: 18px;
  height: 18px;
  border-radius: 50%;
  object-fit: cover;
}

.header-host {
  font-size: 0.75em;
  font-weight: normal;
  opacity: 0.6;
  max-width: 120px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.search-bar {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 12px;
  border-bottom: 1px solid var(--nd-divider);
  background: var(--nd-panelHeaderBg);
}

.search-icon {
  flex-shrink: 0;
  opacity: 0.4;
}

.search-input {
  flex: 1;
  min-width: 0;
  background: var(--nd-buttonBg);
  border: none;
  border-radius: 6px;
  padding: 6px 10px;
  font-size: 0.85em;
  color: var(--nd-fg);
  outline: none;
}

.search-input:focus {
  box-shadow: 0 0 0 2px var(--nd-accent);
}

.search-input::placeholder {
  color: var(--nd-fg);
  opacity: 0.4;
}

.search-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border-radius: 6px;
  flex-shrink: 0;
  opacity: 0.6;
  transition: opacity 0.15s, background 0.15s;
}

.search-btn:hover:not(:disabled) {
  background: var(--nd-buttonHoverBg);
  opacity: 1;
}

.search-btn:disabled {
  opacity: 0.2;
}

.search-body {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.search-scroller {
  flex: 1;
  overflow-x: clip;
  scrollbar-color: var(--nd-scrollbarHandle) transparent;
  scrollbar-width: thin;
}

.column-empty {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 2rem 1rem;
  color: var(--nd-fg);
  opacity: 0.5;
  font-size: 0.85em;
}

.column-error {
  color: var(--nd-love);
  opacity: 1;
}

.loading-more {
  text-align: center;
  padding: 1rem;
  font-size: 0.8em;
  opacity: 0.4;
}

.search-preview-hint {
  text-align: center;
  padding: 0.75rem 1rem;
  font-size: 0.75em;
  opacity: 0.4;
  border-top: 1px solid var(--nd-divider);
}
</style>
