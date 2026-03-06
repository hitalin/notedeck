<script setup lang="ts">
import { invoke } from '@tauri-apps/api/core'
import { defineAsyncComponent, onUnmounted, ref, shallowRef, watch } from 'vue'
import { DynamicScroller, DynamicScrollerItem } from 'vue-virtual-scroller'
import type { NormalizedNote } from '@/adapters/types'
import MkNote from '@/components/common/MkNote.vue'
import { useMultiAccountAdapters } from '@/composables/useMultiAccountAdapters'
import { useNoteActions } from '@/composables/useNoteActions'
import { useAccountsStore } from '@/stores/accounts'
import { noteStore } from '@/stores/notes'

const MkPostForm = defineAsyncComponent(
  () => import('@/components/common/MkPostForm.vue'),
)

const accountsStore = useAccountsStore()
const { getOrCreate } = useMultiAccountAdapters()

const notes = shallowRef<NormalizedNote[]>([])

function onMutated(note: NormalizedNote) {
  noteStore.update(note.id, { ...note })
  notes.value = [...notes.value]
}

const { postForm, handlers } = useNoteActions(
  (note) => getOrCreate(note._accountId),
  onMutated,
)

const searchQuery = ref('')
const searchInput = ref<HTMLInputElement | null>(null)
const isLoading = ref(false)
const isPreview = ref(false)
const confirmedQuery = ref('')
const error = ref<string | null>(null)
const scroller = ref<InstanceType<typeof DynamicScroller> | null>(null)

// Per-account search progress
const searchProgress = ref<{ host: string; done: boolean }[]>([])

// Merge notes: dedup by id, sort by createdAt desc
function mergeNotes(
  existing: NormalizedNote[],
  incoming: NormalizedNote[],
): NormalizedNote[] {
  const seen = new Set(existing.map((n) => n.id))
  const merged = [...existing]
  for (const note of incoming) {
    if (!seen.has(note.id)) {
      merged.push(note)
      seen.add(note.id)
    }
  }
  return merged.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
}

// Local search (typeahead preview)
let debounceTimer: ReturnType<typeof setTimeout> | null = null

async function searchLocalAll(q: string) {
  const accounts = accountsStore.accounts
  if (accounts.length === 0) return

  const results = await Promise.allSettled(
    accounts.map((acc) =>
      invoke<NormalizedNote[]>('api_search_notes_local', {
        accountId: acc.id,
        query: q,
        limit: 10,
      }),
    ),
  )

  if (searchQuery.value.trim() !== q) return

  const allNotes: NormalizedNote[] = []
  for (const r of results) {
    if (r.status === 'fulfilled') allNotes.push(...r.value)
  }

  notes.value = mergeNotes([], allNotes)
  isPreview.value = allNotes.length > 0
}

watch(searchQuery, (val) => {
  const q = val.trim()
  if (debounceTimer) clearTimeout(debounceTimer)
  if (!q) {
    notes.value = []
    isPreview.value = false
    return
  }
  if (q === confirmedQuery.value) return
  debounceTimer = setTimeout(() => searchLocalAll(q), 200)
})

// Per-account oldest note tracking for pagination
const lastNoteIds = new Map<string, string>()
const lastNoteCreatedAts = new Map<string, string>()

function updateLastNoteIds(noteList: NormalizedNote[]) {
  for (const note of noteList) {
    const accId = note._accountId
    if (!accId) continue
    const existingAt = lastNoteCreatedAts.get(accId)
    if (!existingAt || note.createdAt < existingAt) {
      lastNoteIds.set(accId, note.id)
      lastNoteCreatedAts.set(accId, note.createdAt)
    }
  }
}

async function performSearch() {
  const q = searchQuery.value.trim()
  if (!q) return
  if (debounceTimer) clearTimeout(debounceTimer)

  error.value = null
  isLoading.value = true
  isPreview.value = false
  confirmedQuery.value = q
  lastNoteIds.clear()
  lastNoteCreatedAts.clear()

  // Local cache first
  await searchLocalAll(q)
  const localNotes = notes.value

  // Server search (all accounts in parallel) with progress
  const accounts = accountsStore.accounts
  searchProgress.value = accounts.map((acc) => ({
    host: acc.host,
    done: false,
  }))

  const results = await Promise.allSettled(
    accounts.map(async (acc, i) => {
      const adapter = await getOrCreate(acc.id)
      if (!adapter) return []
      try {
        return await adapter.api.searchNotes(q)
      } finally {
        searchProgress.value = searchProgress.value.map((p, j) =>
          j === i ? { ...p, done: true } : p,
        )
      }
    }),
  )

  const serverNotes: NormalizedNote[] = []
  for (const r of results) {
    if (r.status === 'fulfilled') serverNotes.push(...r.value)
  }

  notes.value = mergeNotes(localNotes, serverNotes)
  updateLastNoteIds(notes.value)

  if (notes.value.length === 0) {
    error.value = '結果が見つかりません'
  }

  isLoading.value = false
  searchProgress.value = []
}

async function loadMore() {
  if (isLoading.value || notes.value.length === 0) return
  const q = confirmedQuery.value
  if (!q) return

  isLoading.value = true
  const accounts = accountsStore.accounts

  const results = await Promise.allSettled(
    accounts.map(async (acc) => {
      const adapter = await getOrCreate(acc.id)
      if (!adapter) return []
      const untilId = lastNoteIds.get(acc.id)
      if (!untilId) return []
      return adapter.api.searchNotes(q, { untilId })
    }),
  )

  const olderNotes: NormalizedNote[] = []
  for (const r of results) {
    if (r.status === 'fulfilled') olderNotes.push(...r.value)
  }

  if (olderNotes.length > 0) {
    notes.value = mergeNotes(notes.value, olderNotes)
    updateLastNoteIds(olderNotes)
  }

  isLoading.value = false
}

// Scroll handler
let lastScrollCheck = 0
function handleScroll() {
  const now = Date.now()
  if (now - lastScrollCheck < 200) return
  lastScrollCheck = now
  const el = scroller.value?.$el as HTMLElement | undefined
  if (!el) return
  if (el.scrollTop + el.clientHeight >= el.scrollHeight - 300) {
    loadMore()
  }
}

// Delete with optimistic removal from list
async function handleDelete(note: NormalizedNote) {
  const id = note.id
  const prevNotes = notes.value
  notes.value = notes.value.filter((n) => n.id !== id && n.renoteId !== id)
  const ok = await handlers.delete(note)
  if (!ok) notes.value = prevNotes
}

async function handlePosted(editedNoteId?: string) {
  postForm.close()
  if (editedNoteId) {
    const note = notes.value.find((n) => n.id === editedNoteId)
    if (!note) return
    const adapter = await getOrCreate(note._accountId)
    if (!adapter) return
    try {
      const updated = await adapter.api.getNote(editedNoteId)
      notes.value = notes.value.map((n) =>
        n.id === editedNoteId
          ? updated
          : n.renoteId === editedNoteId
            ? { ...n, renote: updated }
            : n,
      )
    } catch {
      // note may have been deleted
    }
  }
}

function clearSearch() {
  searchQuery.value = ''
  confirmedQuery.value = ''
  notes.value = []
  isPreview.value = false
  error.value = null
  searchInput.value?.focus()
}

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Enter') performSearch()
}

onUnmounted(() => {
  if (debounceTimer) clearTimeout(debounceTimer)
})

// Auto-focus the search input
setTimeout(() => searchInput.value?.focus(), 100)
</script>

<template>
  <div class="search-content">
    <div class="search-bar">
      <i class="ti ti-search search-icon" />
      <input
        ref="searchInput"
        v-model="searchQuery"
        class="search-input"
        type="text"
        placeholder="全アカウントを検索..."
        @keydown="onKeydown"
      />
      <button
        v-if="searchQuery"
        class="_button search-clear"
        title="Clear"
        @click="clearSearch"
      >
        <i class="ti ti-x" />
      </button>
      <button
        class="_button search-btn"
        :disabled="!searchQuery.trim() || isLoading"
        @click="performSearch"
      >
        <i class="ti ti-arrow-right" />
      </button>
    </div>

    <!-- Per-account progress bar -->
    <div v-if="searchProgress.length > 0" class="search-progress">
      <span
        v-for="(p, i) in searchProgress"
        :key="i"
        class="progress-dot"
        :class="{ done: p.done }"
        :title="p.host"
      />
    </div>

    <div v-if="isLoading && notes.length === 0 && searchProgress.length === 0" class="search-empty">
      Searching...
    </div>

    <div v-else-if="!searchQuery.trim() && notes.length === 0" class="search-empty">
      <div class="search-empty-icon">
        <i class="ti ti-search" />
      </div>
      <span>検索クエリを入力</span>
    </div>

    <div v-else-if="error && notes.length === 0" class="search-empty">
      {{ error }}
    </div>

    <DynamicScroller
      v-else-if="notes.length > 0"
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
            @react="handlers.reaction"
            @reply="handlers.reply"
            @renote="handlers.renote"
            @quote="handlers.quote"
            @delete="handleDelete"
            @edit="handlers.edit"
            @bookmark="handlers.bookmark"
          />
        </DynamicScrollerItem>
      </template>

      <template #after>
        <div v-if="isPreview && notes.length > 0" class="search-hint">
          Press Enter to search server
        </div>
        <div v-else-if="isLoading && notes.length > 0" class="search-loading">
          Loading more...
        </div>
      </template>
    </DynamicScroller>
  </div>

  <Teleport to="body">
    <MkPostForm
      v-if="postForm.show.value && postForm.accountId.value"
      :account-id="postForm.accountId.value"
      :reply-to="postForm.replyTo.value"
      :renote-id="postForm.renoteId.value"
      :edit-note="postForm.editNote.value"
      @close="postForm.close"
      @posted="handlePosted"
    />
  </Teleport>
</template>

<style scoped>
.search-content {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
}

.search-bar {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 12px;
  border-bottom: 1px solid var(--nd-divider);
  flex-shrink: 0;
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

.search-clear {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  border-radius: 50%;
  flex-shrink: 0;
  opacity: 0.35;
  font-size: 0.8em;
  transition: opacity 0.15s, background 0.15s;
}

.search-clear:hover {
  background: var(--nd-buttonHoverBg);
  opacity: 0.7;
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

.search-progress {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 6px 12px;
  flex-shrink: 0;
}

.progress-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--nd-fg);
  opacity: 0.15;
  transition: opacity 0.3s, background 0.3s;
}

.progress-dot.done {
  background: var(--nd-accent);
  opacity: 0.8;
}

.search-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 2rem 1rem;
  color: var(--nd-fg);
  opacity: 0.5;
  font-size: 0.85em;
}

.search-empty-icon {
  font-size: 2em;
  opacity: 0.3;
}

.search-scroller {
  flex: 1;
  min-height: 0;
  overflow-x: clip;
  scrollbar-color: var(--nd-scrollbarHandle) transparent;
  scrollbar-width: thin;
}

.search-hint {
  text-align: center;
  padding: 0.75rem 1rem;
  font-size: 0.75em;
  opacity: 0.4;
  border-top: 1px solid var(--nd-divider);
}

.search-loading {
  text-align: center;
  padding: 1rem;
  font-size: 0.8em;
  opacity: 0.4;
}
</style>
