<script setup lang="ts">
import {
  computed,
  defineAsyncComponent,
  onMounted,
  onUnmounted,
  ref,
  shallowRef,
  watch,
} from 'vue'
import type { NormalizedNote } from '@/adapters/types'
import AvatarStack from '@/components/common/AvatarStack.vue'
import LoadingSpinner from '@/components/common/LoadingSpinner.vue'
import MkNote from '@/components/common/MkNote.vue'
import NoteScroller from '@/components/common/NoteScroller.vue'
import RegexGuide from '@/components/common/RegexGuide.vue'
import { useNavigation } from '@/composables/useNavigation'
import { useVaporTransition } from '@/composables/useVaporTransition'
import { getAccountAvatarUrl } from '@/stores/accounts'
import { invoke } from '@/utils/tauriInvoke'

const MkPostForm = defineAsyncComponent(
  () => import('@/components/common/MkPostForm.vue'),
)

import { useColumnSetup } from '@/composables/useColumnSetup'
import { useMultiAccountAdapters } from '@/composables/useMultiAccountAdapters'
import { useNoteFocus } from '@/composables/useNoteFocus'
import { useSearchFilters } from '@/composables/useSearchFilters'
import { useAccountsStore } from '@/stores/accounts'
import type { DeckColumn as DeckColumnType } from '@/stores/deck'
import { useDeckStore } from '@/stores/deck'
import { AppError } from '@/utils/errors'
import {
  extractLiterals,
  filterNotesByRegex,
  isValidRegex,
} from '@/utils/regexSearch'
import DeckColumn from './DeckColumn.vue'

const props = defineProps<{
  column: DeckColumnType
}>()

const isCrossAccount = computed(() => props.column.accountId == null)
const accountsStore = useAccountsStore()
const multiAdapters = useMultiAccountAdapters()

const deckStore = useDeckStore()
const {
  account,
  columnThemeVars,
  serverIconUrl,
  isLoading,
  error,
  initAdapter,
  getAdapter,
  disconnect,
  postForm,
  handlers,
  scroller,
  onScroll,
  setOnNotesMutated,
} = useColumnSetup(() => props.column)

const { navigateToNote } = useNavigation()
const notes = shallowRef<NormalizedNote[]>([])
const noteScrollerRef = ref<{
  getElement: () => HTMLElement | null
  scrollToIndex: (
    index: number,
    opts?: { align?: string; behavior?: string },
  ) => void
} | null>(null)
watch(
  noteScrollerRef,
  () => {
    scroller.value = noteScrollerRef.value?.getElement() ?? null
  },
  { flush: 'post' },
)
setOnNotesMutated(() => {
  notes.value = [...notes.value]
})
const { focusedNoteId } = useNoteFocus(
  props.column.id,
  notes,
  scroller,
  { ...handlers, delete: removeNote, edit: handlers.edit },
  (note) => navigateToNote(note._accountId, note.id),
  undefined,
  (index) => noteScrollerRef.value?.scrollToIndex(index),
)
const searchQuery = ref(props.column.query ?? '')
const searchInput = ref<HTMLInputElement | null>(null)
const hasLocalResults = ref(false)
const isPreview = ref(false)
const confirmedQuery = ref('')

// Regex mode
const regexMode = ref(false)
const showRegexGuide = ref(false)
const regexError = ref<string | null>(null)
const regexGuidePos = ref({ top: 0, right: 0 })
const regexGuideBtnRef = ref<HTMLElement | null>(null)
const { visible: regexGuideVisible, leaving: regexGuideLeaving } =
  useVaporTransition(showRegexGuide, { enterDuration: 180, leaveDuration: 200 })

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
  // Remove any stale listener before adding a new one
  document.removeEventListener('click', closeRegexGuide)
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

function getSearchHint(q: string): string {
  if (!regexMode.value) return q
  return extractLiterals(q)
}

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

// Incremental local search (typeahead)
let debounceTimer: ReturnType<typeof setTimeout> | null = null

async function searchLocal(q: string) {
  if (!q) return
  const hint = getSearchHint(q)
  if (!hint) return

  if (isCrossAccount.value) {
    await searchLocalCrossAccount(q, hint)
  } else {
    await searchLocalPerAccount(q, hint)
  }
}

async function searchLocalPerAccount(q: string, hint: string) {
  if (!props.column.accountId) return
  try {
    let local = await invoke<NormalizedNote[]>('api_search_notes_local', {
      accountId: props.column.accountId,
      query: hint,
      limit: regexMode.value ? 50 : 10,
      sinceDate: getSinceDateISO() ?? null,
      untilDate: getUntilDateISO() ?? null,
      ascending: ascending.value,
    })
    if (searchQuery.value.trim() === q) {
      if (regexMode.value) {
        local = filterNotesByRegex(local, q)
      }
      notes.value = local
      isPreview.value = true
      hasLocalResults.value = local.length > 0
    }
  } catch {
    // non-critical
  }
}

async function searchLocalCrossAccount(q: string, hint: string) {
  const accounts = accountsStore.accounts
  try {
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
    if (searchQuery.value.trim() === q) {
      let merged: NormalizedNote[] = []
      for (const r of results) {
        if (r.status === 'fulfilled' && r.value) {
          merged.push(...r.value)
        }
      }
      if (regexMode.value) {
        merged = filterNotesByRegex(merged, q)
      }
      notes.value = mergeNotes([], merged)
      isPreview.value = true
      hasLocalResults.value = merged.length > 0
    }
  } catch {
    // non-critical
  }
}

watch(searchQuery, (val) => {
  const q = val.trim()
  if (debounceTimer) clearTimeout(debounceTimer)
  regexError.value = null
  if (!q) {
    notes.value = []
    isPreview.value = false
    hasLocalResults.value = false
    return
  }
  if (regexMode.value && !isValidRegex(q)) {
    regexError.value = '無効な正規表現です'
    return
  }
  // Don't show preview if already showing confirmed results for this query
  if (q === confirmedQuery.value) return
  debounceTimer = setTimeout(() => searchLocal(q), 200)
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

  deckStore.updateColumn(props.column.id, { query: q })

  const hint = getSearchHint(q)

  if (isCrossAccount.value) {
    await performSearchCrossAccount(q, hint)
  } else {
    await performSearchPerAccount(q, hint)
  }

  isLoading.value = false
}

async function performSearchPerAccount(q: string, hint: string) {
  // Local search first (instant) if not already showing preview
  if (!hasLocalResults.value && props.column.accountId && hint) {
    try {
      let local = await invoke<NormalizedNote[]>('api_search_notes_local', {
        accountId: props.column.accountId,
        query: hint,
        limit: regexMode.value ? 100 : undefined,
        sinceDate: getSinceDateISO() ?? null,
        untilDate: getUntilDateISO() ?? null,
        ascending: ascending.value,
      })
      if (regexMode.value) {
        local = filterNotesByRegex(local, q)
      }
      if (local.length > 0) {
        notes.value = local
        hasLocalResults.value = true
      }
    } catch {
      // non-critical
    }
  }

  // Server search
  if (hint && account.value) {
    try {
      const adapter = await initAdapter()
      if (adapter) {
        let results = await adapter.api.searchNotes(hint, {
          sinceDate: getSinceDateMs(),
          untilDate: getUntilDateMs(),
        })
        if (regexMode.value) {
          results = filterNotesByRegex(results, q)
        }
        notes.value = mergeNotes(
          hasLocalResults.value ? notes.value : [],
          results,
        )
      }
    } catch (e) {
      if (!hasLocalResults.value) {
        error.value = AppError.from(e)
      }
    }
  }
}

async function performSearchCrossAccount(q: string, hint: string) {
  const accounts = accountsStore.accounts

  // Local search first (instant) if not already showing preview
  if (!hasLocalResults.value && hint) {
    try {
      const localResults = await Promise.allSettled(
        accounts.map((acc) =>
          invoke<NormalizedNote[]>('api_search_notes_local', {
            accountId: acc.id,
            query: hint,
            limit: regexMode.value ? 100 : undefined,
            sinceDate: getSinceDateISO() ?? null,
            untilDate: getUntilDateISO() ?? null,
            ascending: ascending.value,
          }),
        ),
      )
      let merged: NormalizedNote[] = []
      for (const r of localResults) {
        if (r.status === 'fulfilled' && r.value) {
          merged.push(...r.value)
        }
      }
      if (regexMode.value) {
        merged = filterNotesByRegex(merged, q)
      }
      if (merged.length > 0) {
        notes.value = mergeNotes([], merged)
        hasLocalResults.value = true
      }
    } catch {
      // non-critical
    }
  }

  // Server search across all accounts
  if (hint) {
    try {
      const serverResults = await Promise.allSettled(
        accounts.map(async (acc) => {
          const adapter = await multiAdapters.getOrCreate(acc.id)
          if (!adapter) return []
          return adapter.api.searchNotes(hint, {
            sinceDate: getSinceDateMs(),
            untilDate: getUntilDateMs(),
          })
        }),
      )
      let merged: NormalizedNote[] = []
      for (const r of serverResults) {
        if (r.status === 'fulfilled' && r.value) {
          merged.push(...r.value)
        }
      }
      if (regexMode.value) {
        merged = filterNotesByRegex(merged, q)
      }
      notes.value = mergeNotes(hasLocalResults.value ? notes.value : [], merged)
    } catch (e) {
      if (!hasLocalResults.value) {
        error.value = AppError.from(e)
      }
    }
  }
}

async function loadMore() {
  if (isCrossAccount.value) {
    await loadMoreCrossAccount()
  } else {
    await loadMorePerAccount()
  }
}

async function loadMorePerAccount() {
  const adapter = getAdapter()
  if (!adapter || isLoading.value || notes.value.length === 0) return
  const lastNote = notes.value.at(-1)
  if (!lastNote) return

  const q = confirmedQuery.value || searchQuery.value.trim()
  const hint = getSearchHint(q)
  if (!hint) return

  isLoading.value = true
  try {
    let older = await adapter.api.searchNotes(hint, {
      untilId: lastNote.id,
      sinceDate: getSinceDateMs(),
      untilDate: getUntilDateMs(),
    })
    if (regexMode.value) {
      older = filterNotesByRegex(older, q)
    }
    notes.value = mergeNotes(notes.value, older)
  } catch (e) {
    error.value = AppError.from(e)
  } finally {
    isLoading.value = false
  }
}

async function loadMoreCrossAccount() {
  if (isLoading.value || notes.value.length === 0) return

  const q = confirmedQuery.value || searchQuery.value.trim()
  const hint = getSearchHint(q)
  if (!hint) return

  const accounts = accountsStore.accounts
  isLoading.value = true

  try {
    const results = await Promise.allSettled(
      accounts.map(async (acc) => {
        const adapter = await multiAdapters.getOrCreate(acc.id)
        if (!adapter) return []
        // Find this account's oldest note for pagination
        const lastForAccount = [...notes.value]
          .reverse()
          .find((n) => n._accountId === acc.id)
        return adapter.api.searchNotes(hint, {
          untilId: lastForAccount?.id,
          sinceDate: getSinceDateMs(),
          untilDate: getUntilDateMs(),
        })
      }),
    )

    let older: NormalizedNote[] = []
    for (const r of results) {
      if (r.status === 'fulfilled' && r.value) {
        older.push(...r.value)
      }
    }
    if (regexMode.value) {
      older = filterNotesByRegex(older, q)
    }
    notes.value = mergeNotes(notes.value, older)
  } catch (e) {
    error.value = AppError.from(e)
  } finally {
    isLoading.value = false
  }
}

async function removeNote(note: NormalizedNote) {
  const id = note.id
  const prevNotes = notes.value
  notes.value = notes.value.filter((n) => n.id !== id && n.renoteId !== id)

  if (isCrossAccount.value) {
    const adapter = await multiAdapters.getOrCreate(note._accountId)
    if (!adapter) {
      notes.value = prevNotes
      return
    }
    try {
      await adapter.api.deleteNote(note.id)
    } catch {
      notes.value = prevNotes
    }
  } else {
    if (!(await handlers.delete(note))) {
      notes.value = prevNotes
    }
  }
}

async function handlePosted(editedNoteId?: string) {
  postForm.close()
  if (editedNoteId) {
    let adapter: Awaited<ReturnType<typeof multiAdapters.getOrCreate>> = null
    if (isCrossAccount.value) {
      const note = notes.value.find((n) => n.id === editedNoteId)
      if (note) adapter = await multiAdapters.getOrCreate(note._accountId)
    } else {
      adapter = getAdapter()
    }
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
    if (!isCrossAccount.value) initAdapter()
    searchInput.value?.focus()
  }
})

onUnmounted(() => {
  if (debounceTimer) clearTimeout(debounceTimer)
  if (filterTimer) clearTimeout(filterTimer)
  document.removeEventListener('click', closeRegexGuide)
  disconnect()
})
</script>

<template>
  <DeckColumn
    :column-id="column.id"
    title="検索"
    :theme-vars="columnThemeVars"
  >
    <template #header-icon>
      <i :class="$style.tlHeaderIcon" class="ti ti-search" />
    </template>

    <template #header-meta>
      <div v-if="isCrossAccount" :class="$style.headerAccount">
        <AvatarStack :size="20" />
      </div>
      <div v-else-if="account" :class="$style.headerAccount">
        <img :src="getAccountAvatarUrl(account)" :class="$style.headerAvatar" />
        <img :class="$style.headerFavicon" :src="serverIconUrl || `https://${account.host}/favicon.ico`" :title="account.host" />
      </div>
    </template>

    <template #header-extra>
      <div :class="$style.searchBar">
        <i :class="$style.searchIcon" class="ti ti-search" />
        <input
          ref="searchInput"
          v-model="searchQuery"
          :class="[$style.searchInput, { [$style.regexInput]: regexMode, [$style.regexInvalid]: regexMode && regexError }]"
          type="text"
          :placeholder="regexMode ? '正規表現で検索...' : 'ノートを検索...'"
          @keydown="onKeydown"
        />
        <div :class="$style.regexControls">
          <button
            :class="[$style.regexToggle, { [$style.regexToggleActive]: regexMode }]"
            class="_button"
            title="正規表現モード"
            @click="toggleRegexMode"
          >
            <span :class="$style.regexIconText">.*</span>
          </button>
          <button
            v-if="regexMode"
            ref="regexGuideBtnRef"
            :class="[$style.regexGuideBtn, { [$style.regexGuideBtnActive]: showRegexGuide }]"
            class="_button"
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
          :class="$style.searchBtn"
          class="_button"
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
    </template>

    <div v-if="!account && !isCrossAccount" :class="$style.columnEmpty">
      アカウントが見つかりません
    </div>

    <div v-else-if="error" :class="[$style.columnEmpty, $style.columnError]">
      {{ error.message }}
    </div>

    <div v-else :class="$style.searchBody">
      <div v-if="isLoading && notes.length === 0" :class="$style.columnLoading">
        <LoadingSpinner />
      </div>

      <div v-else-if="!searchQuery.trim() && notes.length === 0" :class="$style.columnEmpty">
        検索クエリを入力
      </div>

      <div v-else-if="searchQuery.trim() && !isLoading && !isPreview && notes.length === 0" :class="$style.columnEmpty">
        結果が見つかりません
      </div>

      <NoteScroller
        v-else
        ref="noteScrollerRef"
        :items="notes"
        :focused-id="focusedNoteId"
        :class="$style.searchScroller"
        @scroll="handleScroll"
      >
        <template #default="{ item, index }">
          <div>
            <MkNote
              :note="item"
              :focused="item.id === focusedNoteId"
              @react="handlers.reaction"
              @reply="handlers.reply"
              @renote="handlers.renote"
              @quote="handlers.quote"
              @delete="removeNote"
              @edit="handlers.edit"
              @bookmark="handlers.bookmark"
              @delete-and-edit="handlers.deleteAndEdit"
            />
          </div>
        </template>

        <template #append>
          <div v-if="isPreview && notes.length > 0" :class="$style.searchPreviewHint">
            Enterキーでサーバーを検索
          </div>
          <div v-else-if="isLoading && notes.length > 0" :class="$style.loadingMore">
            <LoadingSpinner />
          </div>
        </template>
      </NoteScroller>
    </div>
  </DeckColumn>

  <Teleport to="body">
    <MkPostForm
      v-if="postForm.show.value && column.accountId && account?.hasToken"
      :account-id="column.accountId"
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
@use './column-common.module.scss';

.searchBar {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 12px;
  border-bottom: 1px solid var(--nd-divider);
  background: var(--nd-bg);
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
}

.regexToggleActive {
  opacity: 1;
  color: var(--nd-accent);
  background: var(--nd-accent-hover);
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

  &:hover {
    background: var(--nd-buttonHoverBg);
    opacity: 0.7;
  }
}

.regexGuideBtnActive {
  background: var(--nd-buttonHoverBg);
  opacity: 0.7;
}

.regexInput {
  font-family: monospace;
}

.regexInvalid {
  box-shadow: 0 0 0 2px var(--nd-love) !important;
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

.searchBody {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.searchScroller {
  flex: 1;
  overflow-x: clip;
  scrollbar-color: var(--nd-scrollbarHandle) transparent;
  scrollbar-width: thin;
}

.searchPreviewHint {
  text-align: center;
  padding: 0.75rem 1rem;
  font-size: 0.75em;
  opacity: 0.4;
  border-top: 1px solid var(--nd-divider);
}

.regexGuidePopup {
  position: fixed;
  z-index: calc(var(--nd-z-popup) + 1);
}

.regexGuideEnter {
  animation: regexGuideIn 0.2s var(--nd-ease-pop);
}

.regexGuideLeave {
  animation: regexGuideOut 0.2s var(--nd-ease-pop) forwards;
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

