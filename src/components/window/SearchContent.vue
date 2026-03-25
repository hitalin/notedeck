<script setup lang="ts">
import { defineAsyncComponent, onUnmounted, ref, shallowRef, watch } from 'vue'
import type { NormalizedNote } from '@/adapters/types'
import MkNote from '@/components/common/MkNote.vue'
import NoteScroller from '@/components/common/NoteScroller.vue'
import RegexGuide from '@/components/common/RegexGuide.vue'
import { useMultiAccountAdapters } from '@/composables/useMultiAccountAdapters'
import { useNoteActions } from '@/composables/useNoteActions'
import { useSearchFilters } from '@/composables/useSearchFilters'
import { useVaporTransition } from '@/composables/useVaporTransition'
import { useAccountsStore } from '@/stores/accounts'
import { useNoteStore } from '@/stores/notes'
import { useIsCompactLayout } from '@/stores/ui'
import {
  extractLiterals,
  filterNotesByRegex,
  isValidRegex,
} from '@/utils/regexSearch'
import { invoke } from '@/utils/tauriInvoke'

const MkPostForm = defineAsyncComponent(
  () => import('@/components/common/MkPostForm.vue'),
)

const noteStore = useNoteStore()
const accountsStore = useAccountsStore()
const isCompact = useIsCompactLayout()
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
const noteScrollerRef = ref<{ getElement: () => HTMLElement | null } | null>(
  null,
)

// Regex mode
const regexMode = ref(false)
const showRegexGuide = ref(false)
const regexError = ref<string | null>(null)

const regexGuidePos = ref({ top: 0, right: 0 })
const regexGuideBtnRef = ref<HTMLElement | null>(null)
const { visible: regexGuideVisible, leaving: regexGuideLeaving } =
  useVaporTransition(showRegexGuide, { enterDuration: 200, leaveDuration: 200 })

// Date filter & sort
const {
  sinceDate,
  untilDate,
  ascending,
  showFilters,
  toggleFilters,
  clearDateFilters,
  toggleSort,
  getSinceDateMs,
  getUntilDateMs,
  getSinceDateISO,
  getUntilDateISO,
  hasDateFilter,
} = useSearchFilters()

function toggleRegexMode() {
  regexMode.value = !regexMode.value
  showRegexGuide.value = false
  regexError.value = null
}

function openRegexGuide() {
  if (showRegexGuide.value) {
    showRegexGuide.value = false
    return
  }
  if (regexGuideBtnRef.value) {
    const rect = regexGuideBtnRef.value.getBoundingClientRect()
    regexGuidePos.value = {
      top: rect.bottom + 4,
      right: document.documentElement.clientWidth - rect.right,
    }
  }
  showRegexGuide.value = true
  setTimeout(() => {
    document.addEventListener('click', closeRegexGuide, { once: true })
  }, 0)
}

function closeRegexGuide() {
  showRegexGuide.value = false
}

function onFilterApply(pattern: string) {
  searchQuery.value = pattern
  showRegexGuide.value = false
  searchInput.value?.focus()
}

/** 正規表現モード時、検索クエリを取得（リテラル抽出 or 空） */
function getSearchHint(q: string): string {
  if (!regexMode.value) return q
  return extractLiterals(q)
}

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
  const dir = ascending.value ? 1 : -1
  return merged.sort((a, b) => dir * a.createdAt.localeCompare(b.createdAt))
}

// Local search (typeahead preview)
let debounceTimer: ReturnType<typeof setTimeout> | null = null

async function searchLocalAll(q: string) {
  const accounts = accountsStore.accounts
  if (accounts.length === 0) return

  const hint = getSearchHint(q)
  if (!hint) return

  const results = await Promise.allSettled(
    accounts.map((acc) =>
      invoke<NormalizedNote[]>('api_search_notes_local', {
        accountId: acc.id,
        query: hint,
        limit: regexMode.value ? 50 : 10,
        sinceDate: getSinceDateISO() ?? null,
        untilDate: getUntilDateISO() ?? null,
        ascending: ascending.value,
      }),
    ),
  )

  if (searchQuery.value.trim() !== q) return

  let allNotes: NormalizedNote[] = []
  for (const r of results) {
    if (r.status === 'fulfilled') allNotes.push(...r.value)
  }

  if (regexMode.value) {
    allNotes = filterNotesByRegex(allNotes, q)
  }

  notes.value = mergeNotes([], allNotes)
  isPreview.value = allNotes.length > 0
}

watch(searchQuery, (val) => {
  const q = val.trim()
  if (debounceTimer) clearTimeout(debounceTimer)
  regexError.value = null
  if (!q) {
    notes.value = []
    isPreview.value = false
    return
  }
  if (regexMode.value && !isValidRegex(q)) {
    regexError.value = '無効な正規表現です'
    return
  }
  if (q === confirmedQuery.value) return
  debounceTimer = setTimeout(() => searchLocalAll(q), 200)
})

// Re-search when date filters or sort order change (debounced)
let filterTimer: ReturnType<typeof setTimeout> | null = null
watch([sinceDate, untilDate, ascending], () => {
  if (filterTimer) clearTimeout(filterTimer)
  filterTimer = setTimeout(() => {
    const q = confirmedQuery.value || searchQuery.value.trim()
    if (q) performSearch()
  }, 400)
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

  if (regexMode.value && !isValidRegex(q)) {
    regexError.value = '無効な正規表現です'
    return
  }

  error.value = null
  regexError.value = null
  isLoading.value = true
  isPreview.value = false
  confirmedQuery.value = q
  lastNoteIds.clear()
  lastNoteCreatedAts.clear()

  // Local cache first
  await searchLocalAll(q)
  const localNotes = notes.value

  // Server search (all accounts in parallel) with progress
  const hint = getSearchHint(q)
  const accounts = accountsStore.accounts
  searchProgress.value = accounts.map((acc) => ({
    host: acc.host,
    done: false,
  }))

  if (hint) {
    const results = await Promise.allSettled(
      accounts.map(async (acc, i) => {
        const adapter = await getOrCreate(acc.id)
        if (!adapter) return []
        try {
          return await adapter.api.searchNotes(hint, {
            sinceDate: getSinceDateMs(),
            untilDate: getUntilDateMs(),
          })
        } finally {
          searchProgress.value = searchProgress.value.map((p, j) =>
            j === i ? { ...p, done: true } : p,
          )
        }
      }),
    )

    let serverNotes: NormalizedNote[] = []
    for (const r of results) {
      if (r.status === 'fulfilled') serverNotes.push(...r.value)
    }

    if (regexMode.value) {
      serverNotes = filterNotesByRegex(serverNotes, q)
    }

    notes.value = mergeNotes(localNotes, serverNotes)
  }

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

  const hint = getSearchHint(q)
  if (!hint) return

  isLoading.value = true
  const accounts = accountsStore.accounts

  const results = await Promise.allSettled(
    accounts.map(async (acc) => {
      const adapter = await getOrCreate(acc.id)
      if (!adapter) return []
      const untilId = lastNoteIds.get(acc.id)
      if (!untilId) return []
      return adapter.api.searchNotes(hint, {
        untilId,
        sinceDate: getSinceDateMs(),
        untilDate: getUntilDateMs(),
      })
    }),
  )

  let olderNotes: NormalizedNote[] = []
  for (const r of results) {
    if (r.status === 'fulfilled') olderNotes.push(...r.value)
  }

  if (regexMode.value) {
    olderNotes = filterNotesByRegex(olderNotes, q)
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
  const el = noteScrollerRef.value?.getElement()
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
  if (filterTimer) clearTimeout(filterTimer)
  document.removeEventListener('click', closeRegexGuide)
})

// Auto-focus the search input
setTimeout(() => searchInput.value?.focus(), 100)
</script>

<template>
  <div :class="[$style.searchContent, { [$style.mobile]: isCompact }]">
    <div :class="$style.searchBar">
      <i :class="['ti', 'ti-search', $style.searchIcon]" />
      <input
        ref="searchInput"
        v-model="searchQuery"
        :class="[$style.searchInput, { [$style.regexInput]: regexMode, [$style.regexInvalid]: regexMode && regexError }]"
        type="text"
        :placeholder="regexMode ? '正規表現で検索...' : '全アカウントを検索...'"
        @keydown="onKeydown"
      />
      <div :class="$style.regexControls">
        <button
          class="_button"
          :class="[$style.regexToggle, { [$style.active]: regexMode }]"
          title="正規表現モード"
          @click="toggleRegexMode"
        >
          <span :class="$style.regexIconText">.*</span>
        </button>
        <button
          v-if="regexMode"
          ref="regexGuideBtnRef"
          class="_button"
          :class="[$style.regexGuideBtn, { [$style.active]: showRegexGuide }]"
          title="正規表現ガイド"
          @click.stop="openRegexGuide"
        >
          <i class="ti ti-help" />
        </button>
        <button
          :class="[$style.filterToggle, { [$style.filterToggleActive]: showFilters || hasDateFilter() }]"
          class="_button"
          title="日付フィルター"
          @click="toggleFilters"
        >
          <i class="ti ti-calendar" />
        </button>
        <button
          :class="[$style.sortToggle, { [$style.sortToggleActive]: ascending }]"
          class="_button"
          :title="ascending ? '古い順' : '新しい順'"
          @click="toggleSort"
        >
          <i :class="ascending ? 'ti ti-sort-ascending' : 'ti ti-sort-descending'" />
        </button>
      </div>
      <button
        v-if="searchQuery"
        class="_button"
        :class="$style.searchClear"
        title="Clear"
        @click="clearSearch"
      >
        <i class="ti ti-x" />
      </button>
      <button
        class="_button"
        :class="$style.searchBtn"
        :disabled="!searchQuery.trim() || isLoading || (regexMode && !!regexError)"
        @click="performSearch"
      >
        <i class="ti ti-arrow-right" />
      </button>
    </div>

    <div v-if="showFilters" :class="$style.dateFilters">
      <input
        v-model="sinceDate"
        type="date"
        :class="$style.dateInput"
        title="開始日"
      />
      <i :class="$style.dateSeparator" class="ti ti-minus" />
      <input
        v-model="untilDate"
        type="date"
        :class="$style.dateInput"
        title="終了日"
      />
      <button
        v-if="hasDateFilter()"
        :class="$style.dateClear"
        class="_button"
        title="日付クリア"
        @click="clearDateFilters"
      >
        <i class="ti ti-x" />
      </button>
    </div>

    <div v-if="regexError" :class="$style.regexError">
      {{ regexError }}
    </div>

    <Teleport to="body">
      <div
        v-if="regexGuideVisible"
        :class="[$style.regexGuidePopup, regexGuideLeaving ? $style.regexGuideLeave : $style.regexGuideEnter]"
        :style="{ top: regexGuidePos.top + 'px', right: regexGuidePos.right + 'px' }"
        @click.stop
      >
        <RegexGuide @select="onFilterApply" />
      </div>
    </Teleport>

    <!-- Per-account progress bar -->
    <div v-if="searchProgress.length > 0" :class="$style.searchProgress">
      <span
        v-for="(p, i) in searchProgress"
        :key="i"
        :class="[$style.progressDot, { [$style.done]: p.done }]"
        :title="p.host"
      />
    </div>

    <div v-if="isLoading && notes.length === 0 && searchProgress.length === 0" :class="$style.searchEmpty">
      Searching...
    </div>

    <div v-else-if="!searchQuery.trim() && notes.length === 0" :class="$style.searchEmpty">
      <div :class="$style.searchEmptyIcon">
        <i class="ti ti-search" />
      </div>
      <span>検索クエリを入力</span>
    </div>

    <div v-else-if="error && notes.length === 0" :class="$style.searchEmpty">
      {{ error }}
    </div>

    <NoteScroller
      v-else-if="notes.length > 0"
      ref="noteScrollerRef"
      :items="notes"
      :class="$style.searchScroller"
      @scroll="handleScroll"
    >
      <template #default="{ item, index }">
        <div>
          <MkNote
            :note="item"
            @react="handlers.reaction"
            @reply="handlers.reply"
            @renote="handlers.renote"
            @quote="handlers.quote"
            @delete="handleDelete"
            @edit="handlers.edit"
            @bookmark="handlers.bookmark"
            @delete-and-edit="handlers.deleteAndEdit"
          />
        </div>
      </template>

      <template #append>
        <div v-if="isPreview && notes.length > 0" :class="$style.searchHint">
          Press Enter to search server
        </div>
        <div v-else-if="isLoading && notes.length > 0" :class="$style.searchLoading">
          Loading more...
        </div>
      </template>
    </NoteScroller>
  </div>

  <Teleport to="body">
    <MkPostForm
      v-if="postForm.show.value && postForm.accountId.value"
      :account-id="postForm.accountId.value"
      :reply-to="postForm.replyTo.value"
      :renote-id="postForm.renoteId.value"
      :edit-note="postForm.editNote.value"
      :initial-text="postForm.initialText.value"
      :initial-cw="postForm.initialCw.value"
      :initial-visibility="postForm.initialVisibility.value"
      @close="postForm.close"
      @posted="handlePosted"
    />
  </Teleport>
</template>

<style lang="scss" module>
.searchContent {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
}

.searchBar {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 12px;
  border-bottom: 1px solid var(--nd-divider);
  flex-shrink: 0;
}

.searchIcon {
  flex-shrink: 0;
  opacity: 0.4;
}

.searchInput {
  flex: 1;
  min-width: 0;
  background: var(--nd-buttonBg);
  border: none;
  border-radius: var(--nd-radius-sm);
  padding: 6px 10px;
  font-size: 0.85em;
  color: var(--nd-fg);
  outline: none;

  &:focus {
    box-shadow: 0 0 0 2px var(--nd-accent);
  }

  &::placeholder {
    color: var(--nd-fg);
    opacity: 0.4;
  }

  &.regexInput {
    font-family: monospace;
  }

  &.regexInvalid {
    box-shadow: 0 0 0 2px var(--nd-love) !important;
  }
}

.regexControls {
  display: flex;
  align-items: center;
  gap: 2px;
  flex-shrink: 0;
}

.regexToggle {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  border-radius: 4px;
  opacity: 0.35;
  transition: opacity var(--nd-duration-base), background var(--nd-duration-base), color var(--nd-duration-base);

  &:hover {
    background: var(--nd-buttonHoverBg);
    opacity: 0.7;
  }

  &.active {
    opacity: 1;
    color: var(--nd-accent);
    background: var(--nd-accent-hover);
  }
}

.regexIconText {
  font-family: monospace;
  font-size: 0.8em;
  font-weight: 700;
}

.regexGuideBtn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  border-radius: 4px;
  font-size: 0.8em;
  opacity: 0.35;
  transition: opacity var(--nd-duration-base), background var(--nd-duration-base);

  &:hover,
  &.active {
    background: var(--nd-buttonHoverBg);
    opacity: 0.7;
  }
}

.filterToggle,
.sortToggle {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border-radius: 4px;
  opacity: 0.35;
  font-size: 0.9em;
  transition: opacity var(--nd-duration-base), background var(--nd-duration-base), color var(--nd-duration-base);

  &:hover {
    background: var(--nd-buttonHoverBg);
    opacity: 0.7;
  }
}

.filterToggleActive,
.sortToggleActive {
  opacity: 1;
  color: var(--nd-accent);
}

.dateFilters {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 4px 12px;
  flex-shrink: 0;
}

.dateInput {
  flex: 1;
  min-width: 0;
  background: var(--nd-buttonBg);
  border: none;
  border-radius: var(--nd-radius-sm);
  padding: 4px 6px;
  font-size: 0.8em;
  color: var(--nd-fg);
  color-scheme: dark;
  outline: none;

  &:focus {
    box-shadow: 0 0 0 2px var(--nd-accent);
  }
}

.dateSeparator {
  flex-shrink: 0;
  opacity: 0.25;
  font-size: 0.7em;
}

.dateClear {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  border-radius: 4px;
  flex-shrink: 0;
  opacity: 0.35;
  font-size: 0.75em;
  transition: opacity var(--nd-duration-base), background var(--nd-duration-base);

  &:hover {
    background: var(--nd-buttonHoverBg);
    opacity: 0.7;
  }
}

.regexError {
  padding: 4px 12px;
  font-size: 0.75em;
  color: var(--nd-love);
  flex-shrink: 0;
}

.searchClear {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  border-radius: 50%;
  flex-shrink: 0;
  opacity: 0.35;
  font-size: 0.8em;
  transition: opacity var(--nd-duration-base), background var(--nd-duration-base);

  &:hover {
    background: var(--nd-buttonHoverBg);
    opacity: 0.7;
  }
}

.searchBtn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border-radius: var(--nd-radius-sm);
  flex-shrink: 0;
  opacity: 0.6;
  transition: opacity var(--nd-duration-base), background var(--nd-duration-base);

  &:hover:not(:disabled) {
    background: var(--nd-buttonHoverBg);
    opacity: 1;
  }

  &:disabled {
    opacity: 0.2;
  }
}

.searchProgress {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 6px 12px;
  flex-shrink: 0;
}

.progressDot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--nd-fg);
  opacity: 0.15;
  transition: opacity var(--nd-duration-slower), background var(--nd-duration-slower);

  &.done {
    background: var(--nd-accent);
    opacity: 0.8;
  }
}

.searchEmpty {
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

.searchEmptyIcon {
  font-size: 2em;
  opacity: 0.3;
}

.searchScroller {
  flex: 1;
  min-height: 0;
  overflow-x: clip;
  scrollbar-color: var(--nd-scrollbarHandle) transparent;
  scrollbar-width: thin;
}

.searchHint {
  text-align: center;
  padding: 0.75rem 1rem;
  font-size: 0.75em;
  opacity: 0.4;
  border-top: 1px solid var(--nd-divider);
}

.searchLoading {
  text-align: center;
  padding: 1rem;
  font-size: 0.8em;
  opacity: 0.4;
}

.mobile {
  .searchBar {
    padding: 8px;
  }

  .searchInput {
    padding: 8px 10px;
    font-size: 1em;
  }

  .regexToggle {
    width: 36px;
    height: 36px;
  }

  .regexGuideBtn {
    width: 36px;
    height: 36px;
  }

  .searchClear {
    width: 36px;
    height: 36px;
  }

  .searchBtn {
    width: 40px;
    height: 40px;
  }
}

/* Empty placeholder classes for dynamic binding */
.regexInput {}
.regexInvalid {}
.active {}
.done {}

.regexGuidePopup {
  position: fixed;
  z-index: calc(var(--nd-z-popup) + 1);
}

.regexGuideEnter {
  animation: regexGuideIn 0.2s cubic-bezier(0, 0, 0.2, 1);
}

.regexGuideLeave {
  animation: regexGuideOut 0.2s cubic-bezier(0, 0, 0.2, 1) forwards;
}

@keyframes regexGuideIn {
  from {
    opacity: 0;
    transform: scale(0.95) translateY(-4px);
  }
}

@keyframes regexGuideOut {
  to {
    opacity: 0;
    transform: scale(0.95) translateY(-4px);
  }
}
</style>

