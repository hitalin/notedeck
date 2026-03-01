<script setup lang="ts">
import { invoke } from '@tauri-apps/api/core'
import {
  computed,
  nextTick,
  onMounted,
  onUnmounted,
  ref,
  watch,
} from 'vue'
import { useRouter } from 'vue-router'
import { DynamicScroller, DynamicScrollerItem } from 'vue-virtual-scroller'
import type {
  NormalizedNote,
  TimelineFilter,
  TimelineType,
} from '@/adapters/types'
import MkNote from '@/components/common/MkNote.vue'
import MkPostForm from '@/components/common/MkPostForm.vue'
import MkSkeleton from '@/components/common/MkSkeleton.vue'
import { useColumnSetup } from '@/composables/useColumnSetup'
import { useNoteFocus } from '@/composables/useNoteFocus'
import { useNoteList } from '@/composables/useNoteList'
import { useStreamingBatch } from '@/composables/useStreamingBatch'
import { useAccountsStore } from '@/stores/accounts'
import type { DeckColumn as DeckColumnType } from '@/stores/deck'
import { useDeckStore } from '@/stores/deck'
import type { CustomTimelineInfo } from '@/utils/customTimelines'
import {
  clearAvailableTlCache,
  detectAvailableTimelines,
  detectCustomTimelines,
  detectFilterKeys,
  findModeKeyForTimeline,
} from '@/utils/customTimelines'
import { AppError } from '@/utils/errors'
import { matchesFilter } from '@/utils/timelineFilter'
import DeckColumn from './DeckColumn.vue'

const props = defineProps<{
  column: DeckColumnType
}>()

const deckStore = useDeckStore()
const accountsStore = useAccountsStore()
const {
  account,
  columnThemeVars,
  serverIconUrl,
  isLoading,
  error,
  initAdapter,
  getAdapter,
  setSubscription,
  disconnect,
  postForm,
  handlers,
  scroller,
  onScroll,
  setOnNotesMutated,
} = useColumnSetup(() => props.column)

const router = useRouter()
const { notes, noteIds, setNotes, onNoteUpdate, handlePosted, removeNote } = useNoteList({
  getMyUserId: () => account.value?.userId,
  getAdapter,
  deleteHandler: handlers.delete,
  closePostForm: postForm.close,
})
setOnNotesMutated(() => { notes.value = [...notes.value] })

const { pendingNotes, enqueueNote, handleScroll: batchHandleScroll, scrollToTop, resetBatch } = useStreamingBatch({
  notes,
  noteIds,
  scroller,
})

const { focusedNoteId } = useNoteFocus(
  props.column.id,
  notes,
  scroller,
  handlers,
  (note) => router.push(`/note/${note._accountId}/${note.id}`),
)

const tlType = ref<TimelineType>(props.column.tl || 'home')

// Tab slide indicator
const tabsRef = ref<HTMLElement | null>(null)
const tabIndicatorStyle = ref({ left: '0px', width: '0px', opacity: '0' })

function updateTabIndicator() {
  if (!tabsRef.value) return
  const activeTab = tabsRef.value.querySelector(
    '.tl-tab.active',
  ) as HTMLElement | null
  if (!activeTab) {
    tabIndicatorStyle.value = { left: '0px', width: '0px', opacity: '0' }
    return
  }
  tabIndicatorStyle.value = {
    left: `${activeTab.offsetLeft}px`,
    width: `${activeTab.offsetWidth}px`,
    opacity: '1',
  }
}

watch(tlType, () => nextTick(updateTabIndicator))
onMounted(() => nextTick(updateTabIndicator))

const TL_TYPES: { value: TimelineType; label: string }[] = [
  { value: 'home', label: 'Home' },
  { value: 'local', label: 'Local' },
  { value: 'social', label: 'Social' },
  { value: 'global', label: 'Global' },
]

const TL_ICONS: Record<TimelineType, string> = {
  home: 'home',
  local: 'planet',
  social: 'rocket',
  global: 'whirl',
}

function isTablerIcon(icon: string): boolean {
  return !icon.includes(' ')
}

const currentTlIcon = computed(
  () => TL_ICONS[tlType.value] ?? customTlIcon.value ?? 'home',
)

// --- Custom timelines ---
const customTimelines = ref<CustomTimelineInfo[]>([])
const availableStandardTl = ref<string[]>([])
const customTlIcon = computed(() => {
  const ct = customTimelines.value.find((t) => t.type === tlType.value)
  return ct?.icon
})

// --- Mode state (per-account, per-TL) ---
const tlModes = ref<Record<string, boolean>>({})

const allTlTypes = computed(() => {
  const allowed = availableStandardTl.value
  const allowedSet = new Set(allowed)
  const standard =
    allowedSet.size > 0
      ? TL_TYPES.filter((t) => allowedSet.has(t.value))
      : TL_TYPES.map((t) => t)
  for (const ct of customTimelines.value) {
    if (allowedSet.size === 0 || allowedSet.has(ct.type)) {
      standard.push({ value: ct.type, label: ct.label })
    }
  }
  return standard
})

function getTlIcon(type: string): string {
  if (TL_ICONS[type]) return TL_ICONS[type]
  const ct = customTimelines.value.find((t) => t.type === type)
  return ct?.icon ?? TL_ICONS.home ?? ''
}

// --- Filter ---
const showFilterMenu = ref(false)
const filterBtnRef = ref<HTMLButtonElement | null>(null)
const filterPopupPos = ref({ top: 0, left: 0 })

const FILTER_LABELS: Record<keyof TimelineFilter, string> = {
  withRenotes: 'Renotes',
  withReplies: 'Replies',
  withFiles: 'Files only',
  withBots: 'Bots',
  withSensitive: 'Sensitive',
}

const availableFilterKeys = ref<(keyof TimelineFilter)[]>([])

async function refreshFilterKeys() {
  const host = account.value?.host
  if (!host) {
    availableFilterKeys.value = []
    return
  }
  availableFilterKeys.value = await detectFilterKeys(host, tlType.value)
}

const columnFilters = computed<TimelineFilter>(() => props.column.filters ?? {})

const hasActiveFilter = computed(() => {
  const f = columnFilters.value
  return Object.values(f).some((v) => v !== undefined)
})

function toggleFilterMenu() {
  showFilterMenu.value = !showFilterMenu.value
  if (showFilterMenu.value) {
    nextTick(() => {
      const btn = filterBtnRef.value
      if (btn) {
        const rect = btn.getBoundingClientRect()
        filterPopupPos.value = {
          top: rect.bottom + 4,
          left: Math.max(8, rect.right - 220),
        }
      }
      setTimeout(() => {
        document.addEventListener('click', closeFilterMenu, { once: true })
      }, 0)
    })
  }
}

function closeFilterMenu() {
  showFilterMenu.value = false
}

function toggleFilter(key: keyof TimelineFilter) {
  const current = columnFilters.value[key]
  const next = { ...columnFilters.value }
  if (key === 'withFiles') {
    // withFiles: undefined (off) → true (files only) → undefined
    next[key] = current === true ? undefined : true
  } else {
    // withRenotes, withReplies, withBots, withSensitive:
    // undefined (include) → false (exclude) → undefined
    next[key] = current === false ? undefined : false
  }
  // Clean up undefined keys
  for (const k of Object.keys(next) as (keyof TimelineFilter)[]) {
    if (next[k] === undefined) delete next[k]
  }
  deckStore.updateColumn(props.column.id, {
    filters: Object.keys(next).length > 0 ? next : undefined,
  })
  // Reconnect to apply filter
  reconnectWithFilter()
}

function isFilterActive(key: keyof TimelineFilter): boolean {
  const v = columnFilters.value[key]
  if (key === 'withFiles') return v === true
  return v === false
}

async function reconnectWithFilter() {
  disconnect()
  resetBatch()
  setNotes([])
  await connect()
}

async function connect(useCache = false) {
  error.value = null

  isLoading.value = true

  // 1. Instant cache display (initial mount only)
  if (useCache && props.column.accountId) {
    try {
      const cached = await invoke<NormalizedNote[]>('api_get_cached_timeline', {
        accountId: props.column.accountId,
        timelineType: tlType.value,
        limit: 40,
      })
      if (cached.length > 0) {
        setNotes(cached)
      }
    } catch {
      // non-critical
    }
  }

  try {
    const adapter = await initAdapter()
    if (!adapter) return

    // 2. Differential fetch: use sinceId if we have cached notes
    const sinceId = notes.value.length > 0 ? notes.value[0]?.id : undefined
    const filters = columnFilters.value
    const hasFilters = Object.keys(filters).length > 0
    const fetched = await adapter.api.getTimeline(tlType.value, {
      ...(sinceId ? { sinceId } : {}),
      ...(hasFilters ? { filters } : {}),
    })

    if (sinceId && fetched.length > 0) {
      // Merge new notes on top of cached
      const newNotes = fetched.filter((n) => !noteIds.has(n.id))
      setNotes([...newNotes, ...notes.value])
    } else if (fetched.length > 0) {
      setNotes(fetched)
    }
    // If fetched is empty and we have cache, keep showing cache

    adapter.stream.connect()
    setSubscription(
      adapter.stream.subscribeTimeline(
        tlType.value,
        (note: NormalizedNote) => {
          if (!matchesFilter(note, columnFilters.value, tlType.value)) return
          enqueueNote(note)
        },
        { onNoteUpdated: onNoteUpdate },
      ),
    )
  } catch (e) {
    const err = AppError.from(e)
    // 3. Handle "disabled" errors — always refresh policies regardless of cache
    if (String(err.message).includes('disabled')) {
      await refreshPolicies()
      if (!availableStandardTl.value.includes(tlType.value)) {
        switchTl('home')
        return
      }
    }
    if (notes.value.length === 0) {
      error.value = err
    }
  } finally {
    isLoading.value = false
  }
}

async function refreshPolicies() {
  const accountId = props.column.accountId
  const host = account.value?.host
  if (!accountId) return
  clearAvailableTlCache(accountId)
  const availability = await detectAvailableTimelines(accountId)
  if (host) {
    const ct = await detectCustomTimelines(host)
    customTimelines.value = ct.filter((c) => {
      if (!availability.denied.has(c.type)) return true
      const modeKey = findModeKeyForTimeline(c.type, availability.modes)
      return modeKey != null && availability.modes[modeKey] === true
    })
  }
  availableStandardTl.value = [
    ...availability.available,
    ...customTimelines.value.map((c) => c.type),
  ]
  tlModes.value = availability.modes
}

async function switchTl(type: TimelineType) {
  if (type === tlType.value) return
  disconnect()
  resetBatch()
  setNotes([])
  tlType.value = type
  deckStore.updateColumn(props.column.id, { tl: type })
  refreshFilterKeys()
  await connect()
}

async function loadMore() {
  const adapter = getAdapter()
  if (!adapter || isLoading.value || notes.value.length === 0) return
  const lastNote = notes.value.at(-1)
  if (!lastNote) return
  isLoading.value = true
  try {
    const filters = columnFilters.value
    const hasFilters = Object.keys(filters).length > 0
    const older = await adapter.api.getTimeline(tlType.value, {
      untilId: lastNote.id,
      ...(hasFilters ? { filters } : {}),
    })
    setNotes([...notes.value, ...older])
  } catch (e) {
    error.value = AppError.from(e)
  } finally {
    isLoading.value = false
  }
}

function handleScroll() {
  batchHandleScroll()
  onScroll(loadMore)
}

watch(
  () => accountsStore.modeVersion,
  async () => {
    await refreshPolicies()
    if (!availableStandardTl.value.includes(tlType.value)) {
      switchTl('home')
    } else {
      await reconnectWithFilter()
    }
  },
)

let lastResumeAt = 0

async function onResume() {
  const now = Date.now()
  if (now - lastResumeAt < 3000) return
  lastResumeAt = now

  const adapter = getAdapter()
  if (!adapter || !account.value) return

  try {
    const cached = await invoke<NormalizedNote[]>('api_get_cached_timeline', {
      accountId: props.column.accountId,
      timelineType: tlType.value,
      limit: 40,
    })
    if (cached.length > 0) {
      const newFromCache = cached.filter((n) => !noteIds.has(n.id))
      if (newFromCache.length > 0) {
        setNotes([...newFromCache, ...notes.value])
      }
    }
  } catch { /* non-critical */ }

  const sinceId = notes.value[0]?.id
  if (!sinceId) return
  try {
    const filters = columnFilters.value
    const hasFilters = Object.keys(filters).length > 0
    const fetched = await adapter.api.getTimeline(tlType.value, {
      sinceId,
      ...(hasFilters ? { filters } : {}),
    })
    const newFromApi = fetched.filter((n) => !noteIds.has(n.id))
    if (newFromApi.length > 0) {
      setNotes([...newFromApi, ...notes.value])
    }
  } catch { /* non-critical */ }
}

onMounted(async () => {
  window.addEventListener('deck-resume', onResume)
  const host = account.value?.host
  const accountId = props.column.accountId
  // Clear stale policy cache so external mode changes are reflected
  if (accountId) clearAvailableTlCache(accountId)
  connect(true)
  if (host && accountId) {
    const [ct, , availability] = await Promise.all([
      detectCustomTimelines(host),
      refreshFilterKeys(),
      detectAvailableTimelines(accountId),
    ])
    // Only show mode-gated custom TLs when their mode is ON
    customTimelines.value = ct.filter((c) => {
      if (!availability.denied.has(c.type)) return true
      const modeKey = findModeKeyForTimeline(c.type, availability.modes)
      return modeKey != null && availability.modes[modeKey] === true
    })
    availableStandardTl.value = [
      ...availability.available,
      ...customTimelines.value.map((c) => c.type),
    ]
    tlModes.value = availability.modes

    if (!availableStandardTl.value.includes(tlType.value)) {
      switchTl('home')
    }
  }
})

onUnmounted(() => {
  window.removeEventListener('deck-resume', onResume)
  disconnect()
  resetBatch()
})
</script>

<template>
  <DeckColumn
    :column-id="column.id"
    title="Timeline"
    :theme-vars="columnThemeVars"
    @header-click="scrollToTop(true)"
  >
    <template #header-icon>
      <i v-if="isTablerIcon(currentTlIcon)" :class="'ti ti-' + currentTlIcon" class="tl-header-icon" />
      <svg v-else class="tl-header-icon" viewBox="0 0 24 24" width="14" height="14">
        <path :d="currentTlIcon" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" fill="none" />
      </svg>
    </template>

    <template #header-meta>
      <div v-if="account" class="header-account">
        <img v-if="account.avatarUrl" :src="account.avatarUrl" class="header-avatar" />
        <img class="header-favicon" :src="serverIconUrl || `https://${account.host}/favicon.ico`" :title="account.host" />
      </div>
    </template>

    <template #header-extra>
      <div ref="tabsRef" class="tl-tabs">
        <button
          v-for="opt in allTlTypes"
          :key="opt.value"
          class="_button tl-tab"
          :class="{ active: tlType === opt.value }"
          :title="opt.label"
          @click="switchTl(opt.value)"
        >
          <i v-if="isTablerIcon(getTlIcon(opt.value))" :class="'ti ti-' + getTlIcon(opt.value)" class="tl-tab-icon" />
          <svg v-else class="tl-tab-icon" viewBox="0 0 24 24" width="16" height="16">
            <path :d="getTlIcon(opt.value)" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" fill="none" />
          </svg>
          <span v-if="tlType === opt.value" class="tl-tab-label">{{ opt.label }}</span>
        </button>
        <button
          v-if="availableFilterKeys.length > 0"
          ref="filterBtnRef"
          class="_button tl-tab tl-filter-btn"
          :class="{ active: hasActiveFilter }"
          title="Filter"
          @click.stop="toggleFilterMenu"
        >
          <i class="ti ti-filter" />
        </button>
        <div class="tl-tab-indicator" :style="tabIndicatorStyle" />
      </div>
    </template>

    <div v-if="!account" class="column-empty">
      Account not found
    </div>

    <div v-else-if="error" class="column-empty column-error">
      {{ error.message }}
    </div>

    <div v-else class="tl-body">
      <div v-if="isLoading && notes.length === 0">
        <MkSkeleton v-for="i in 5" :key="i" />
      </div>

      <template v-else>
        <button
          v-if="pendingNotes.length > 0"
          class="new-notes-banner _button"
          @click="scrollToTop()"
        >
          {{ pendingNotes.length }} new notes
        </button>

        <DynamicScroller
          ref="scroller"
          class="tl-scroller"
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
              :focused="item.id === focusedNoteId"
              @react="handlers.reaction"
              @reply="handlers.reply"
              @renote="handlers.renote"
              @quote="handlers.quote"
              @delete="removeNote"
              @edit="handlers.edit"
              @bookmark="handlers.bookmark"
            />
          </DynamicScrollerItem>
        </template>

        <template #after>
          <div v-if="isLoading && notes.length > 0" class="loading-more">
            Loading...
          </div>
        </template>
      </DynamicScroller>
      </template>
    </div>
  </DeckColumn>

  <Teleport to="body">
    <MkPostForm
      v-if="postForm.show.value && column.accountId"
      :account-id="column.accountId"
      :reply-to="postForm.replyTo.value"
      :renote-id="postForm.renoteId.value"
      :edit-note="postForm.editNote.value"
      @close="postForm.close"
      @posted="handlePosted"
    />
  </Teleport>

  <Teleport to="body">
    <Transition name="nd-filter-popup">
      <div
        v-if="showFilterMenu"
        class="nd-filter-popup"
        :style="{ ...columnThemeVars, top: filterPopupPos.top + 'px', left: filterPopupPos.left + 'px' }"
        @click.stop
      >
        <div class="nd-filter-popup-header">Filter</div>
        <div
          v-for="key in availableFilterKeys"
          :key="key"
          class="nd-filter-item"
          @click="toggleFilter(key)"
        >
          <span class="nd-filter-label">{{ FILTER_LABELS[key] }}</span>
          <button
            class="nd-filter-toggle"
            :class="{ on: key === 'withFiles' ? isFilterActive(key) : !isFilterActive(key) }"
            :aria-checked="key === 'withFiles' ? isFilterActive(key) : !isFilterActive(key)"
            role="switch"
          >
            <span class="nd-filter-toggle-knob" />
          </button>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.tl-header-icon {
  flex-shrink: 0;
  opacity: 0.7;
}

.header-account {
  display: flex;
  align-items: center;
  gap: 4px;
  flex-shrink: 0;
}

.header-avatar {
  width: 18px;
  height: 18px;
  border-radius: 50%;
  object-fit: cover;
}

.header-favicon {
  width: 16px;
  height: 16px;
  object-fit: contain;
  opacity: 0.7;
}

.tl-tabs {
  display: flex;
  position: relative;
  border-bottom: 1px solid var(--nd-divider);
  background: var(--nd-bg);
}

.tl-tab {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  padding: 8px 12px;
  opacity: 0.4;
  transition: opacity 0.15s, background 0.15s;
  position: relative;
}

.tl-tab:hover {
  opacity: 0.7;
  background: var(--nd-buttonHoverBg);
}

.tl-tab.active {
  opacity: 1;
}

.tl-tab-indicator {
  position: absolute;
  bottom: 0;
  height: 3px;
  background: var(--nd-accent);
  border-radius: 999px 999px 0 0;
  transition: left 0.3s cubic-bezier(0, 0, 0.2, 1), width 0.3s cubic-bezier(0, 0, 0.2, 1);
  pointer-events: none;
}

.tl-tab-icon {
  color: currentColor;
}

.tl-tab-label {
  font-size: 0.85em;
  font-weight: bold;
  white-space: nowrap;
}

.tl-filter-btn {
  margin-left: auto;
}

.tl-filter-btn.active {
  color: var(--nd-accent);
}

.tl-body {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.tl-scroller {
  flex: 1;
  overflow-x: clip;
  scrollbar-color: var(--nd-scrollbarHandle) transparent;
  scrollbar-width: thin;
  will-change: scroll-position;
}

.tl-scroller :deep(.vue-recycle-scroller__item-view) {
  will-change: transform;
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

.new-notes-banner {
  display: block;
  width: 100%;
  padding: 8px 0;
  text-align: center;
  font-size: 0.85em;
  font-weight: bold;
  color: var(--nd-accent);
  background: var(--nd-accentedBg);
  border-bottom: 1px solid var(--nd-divider);
  cursor: pointer;
  flex-shrink: 0;
  transition: background 0.15s;
  animation: slide-down 0.3s ease;
}

@keyframes slide-down {
  from { transform: translateY(-100%); opacity: 0; }
  to { transform: translateY(0); opacity: 1; }
}

.new-notes-banner:hover {
  background: var(--nd-buttonHoverBg);
}

.loading-more {
  text-align: center;
  padding: 1rem;
  font-size: 0.8em;
  opacity: 0.4;
}
</style>

<style>
/* Teleported filter popup — unscoped */
.nd-filter-popup {
  position: fixed;
  z-index: 10000;
  width: 220px;
  padding: 6px;
  background: color-mix(in srgb, var(--nd-panelBg, #313543) 85%, transparent);
  border-radius: 12px;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.15);
  backdrop-filter: blur(16px);
  color: var(--nd-fg, #fff);
  font-size: 0.9em;
}

.nd-filter-popup-header {
  padding: 6px 10px 4px;
  font-size: 0.75em;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  opacity: 0.5;
}

.nd-filter-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 9px 10px;
  border-radius: 8px;
  cursor: pointer;
  transition: background 0.15s;
}

.nd-filter-item:hover {
  background: var(--nd-buttonHoverBg, rgba(255, 255, 255, 0.05));
}

.nd-filter-label {
  font-size: 0.9em;
}

.nd-filter-toggle {
  position: relative;
  width: 40px;
  height: 22px;
  border-radius: 11px;
  background: var(--nd-buttonBg, rgba(255, 255, 255, 0.1));
  border: none;
  cursor: pointer;
  transition: background 0.2s;
  padding: 0;
  flex-shrink: 0;
}

.nd-filter-toggle.on {
  background: var(--nd-accent, #86b300);
}

.nd-filter-toggle-knob {
  position: absolute;
  top: 2px;
  left: 2px;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  background: #fff;
  transition: transform 0.2s;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.2);
}

.nd-filter-toggle.on .nd-filter-toggle-knob {
  transform: translateX(18px);
}

.nd-filter-popup-enter-active,
.nd-filter-popup-leave-active {
  transition: opacity 0.2s cubic-bezier(0, 0, 0.2, 1), transform 0.2s cubic-bezier(0, 0, 0.2, 1);
}

.nd-filter-popup-enter-from,
.nd-filter-popup-leave-to {
  opacity: 0;
  transform: scale(0.95) translateY(-4px);
}
</style>
