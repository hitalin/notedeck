<script setup lang="ts">
import { invoke } from '@tauri-apps/api/core'
import {
  computed,
  defineAsyncComponent,
  nextTick,
  onMounted,
  onUnmounted,
  ref,
  watch,
} from 'vue'
import { DynamicScroller, DynamicScrollerItem } from 'vue-virtual-scroller'
import type {
  NormalizedNote,
  TimelineFilter,
  TimelineType,
} from '@/adapters/types'
import MkAd from '@/components/common/MkAd.vue'
import MkNote from '@/components/common/MkNote.vue'
import { useAds } from '@/composables/useAds'
import { useNavigation } from '@/composables/useNavigation'

const MkPostForm = defineAsyncComponent(
  () => import('@/components/common/MkPostForm.vue'),
)

import MkSkeleton from '@/components/common/MkSkeleton.vue'
import { useColumnSetup } from '@/composables/useColumnSetup'
import { useColumnVisible } from '@/composables/useColumnVisibility'
import { useNoteFocus } from '@/composables/useNoteFocus'
import { useNoteList } from '@/composables/useNoteList'
import { useNoteSound } from '@/composables/useNoteSound'
import { usePullToRefresh } from '@/composables/usePullToRefresh'
import { useStreamingBatch } from '@/composables/useStreamingBatch'
import { useTimeMachine } from '@/composables/useTimeMachine'
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
import { dedup } from '@/utils/dedup'
import { AppError } from '@/utils/errors'
import { sortByCreatedAtDesc } from '@/utils/sortNotes'
import { matchesFilter } from '@/utils/timelineFilter'
import DeckColumn from './DeckColumn.vue'
import TimelineFilterPopup from './TimelineFilterPopup.vue'

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
} = useColumnSetup(() => props.column)

const { navigateToNote } = useNavigation()
const { fetchAds, pickAd, shouldShowAd, muteAd, serverHost } = useAds(
  () => props.column.accountId ?? undefined,
)
const { notes, noteIds, setNotes, onNoteUpdate, handlePosted, removeNote } =
  useNoteList({
    getMyUserId: () => account.value?.userId,
    getAdapter,
    deleteHandler: handlers.delete,
    closePostForm: postForm.close,
  })

const noteSound = useNoteSound(() => account.value?.host)
const {
  pendingNotes,
  isAtTop,
  enqueueNote,
  handleScroll: batchHandleScroll,
  scrollToTop,
  removePending,
  resetBatch,
  setPaused,
} = useStreamingBatch({
  notes,
  noteIds,
  scroller,
  onNewNotes: () => {
    if (!props.column.soundMuted) noteSound.play()
  },
})

// Pause streaming batch when column scrolls off-screen; catch up when visible again
const { isVisible: columnVisible } = useColumnVisible(props.column.id)
let _wasHidden = false
let _lastCatchUpAt = 0
watch(columnVisible, async (visible) => {
  setPaused(!visible)
  if (visible && _wasHidden) {
    _wasHidden = false
    const now = Date.now()
    if (now - _lastCatchUpAt < 10_000) return
    _lastCatchUpAt = now
    const adapter = getAdapter()
    if (!adapter || timeMachine.isActive.value || notes.value.length === 0)
      return
    try {
      const fetched = await adapter.api.getTimeline(
        tlType.value,
        buildTimelineOptions(),
      )
      if (fetched.length > 0) {
        const newNotes = fetched.filter((n) => !noteIds.has(n.id))
        if (newNotes.length > 0) {
          setNotes(sortByCreatedAtDesc([...newNotes, ...notes.value]))
        }
      }
    } catch {
      // ignore catch-up errors
    }
  } else if (!visible) {
    _wasHidden = true
  }
})

const { focusedNoteId } = useNoteFocus(
  props.column.id,
  notes,
  scroller,
  handlers,
  (note) => navigateToNote(note._accountId, note.id),
  props.column.accountId ?? undefined,
)

const tlType = ref<TimelineType>(props.column.tl || 'home')

// --- Time Machine ---
const timeMachine = useTimeMachine(
  () => props.column.accountId ?? undefined,
  () => tlType.value,
)

async function toggleTimeMachine() {
  if (timeMachine.isActive.value) {
    exitTimeMachine()
    return
  }
  setPaused(true)
  disconnect()
  try {
    await timeMachine.loadDateRange()
    if (timeMachine.dateRange.value) {
      const cached = await timeMachine.jumpToDate(
        timeMachine.dateRange.value.max.slice(0, 10),
      )
      setNotes(cached)
    } else {
      // No cache available — revert
      setPaused(false)
      connect(true)
    }
  } catch (e) {
    console.error('[time-machine] failed to activate:', e)
    setPaused(false)
    connect(true)
  }
}

async function onTimeMachineDateChange(date: string) {
  try {
    const cached = await timeMachine.jumpToDate(date)
    setNotes(cached)
    scrollToTop()
  } catch (e) {
    console.error('[time-machine] jumpToDate failed:', e)
  }
}

function tmShiftDay(delta: number) {
  const current = timeMachine.targetDate.value
  if (!current) return
  const d = new Date(current)
  d.setDate(d.getDate() + delta)
  const range = timeMachine.dateRange.value
  if (range) {
    const min = range.min.slice(0, 10)
    const max = range.max.slice(0, 10)
    const iso = d.toISOString().slice(0, 10)
    if (iso < min || iso > max) return
  }
  onTimeMachineDateChange(d.toISOString().slice(0, 10))
}

function exitTimeMachine() {
  timeMachine.deactivate()
  setPaused(false)
  resetBatch()
  setNotes([])
  connect(true)
}

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
  { value: 'home', label: 'ホーム' },
  { value: 'local', label: 'ローカル' },
  { value: 'social', label: 'ソーシャル' },
  { value: 'global', label: 'グローバル' },
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
    })
  }
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

async function reconnectWithFilter() {
  disconnect()
  resetBatch()
  isLoading.value = true
  setNotes([])
  await connect(true)
}

async function fetchCachedNotes(): Promise<NormalizedNote[]> {
  if (!props.column.accountId) return []
  try {
    return await invoke<NormalizedNote[]>('api_get_cached_timeline', {
      accountId: props.column.accountId,
      timelineType: tlType.value,
      limit: 40,
    })
  } catch {
    return []
  }
}

function buildTimelineOptions() {
  const filters = columnFilters.value
  const hasFilters = Object.keys(filters).length > 0
  return {
    ...(hasFilters ? { filters } : {}),
  }
}

async function connect(useCache = false) {
  error.value = null

  isLoading.value = true

  if (useCache) {
    const cached = await fetchCachedNotes()
    if (cached.length > 0) setNotes(cached)
  }

  try {
    const adapter = await initAdapter()
    if (!adapter) return

    // Start streaming setup immediately (connect + subscribe in single IPC).
    // Runs in parallel with the API fetch below.
    adapter.stream.connect()
    setSubscription(
      adapter.stream.subscribeTimeline(
        tlType.value,
        (note: NormalizedNote) => {
          if (!matchesFilter(note, columnFilters.value, tlType.value)) return
          enqueueNote(note)
        },
        {
          onNoteUpdated: (event) => {
            if (event.type === 'deleted') removePending(event.noteId)
            onNoteUpdate(event)
          },
        },
      ),
    )
    noteSound.warmup()

    // Always fetch latest notes (no sinceId) to ensure newest notes are shown.
    // Misskey API with sinceId returns ascending order, so only the oldest
    // "new" notes would be returned, missing the actual latest notes.
    const dedupKey = `${props.column.accountId}:timeline:${tlType.value}`
    const fetched = await dedup(dedupKey, () =>
      adapter.api.getTimeline(tlType.value, buildTimelineOptions()),
    )

    if (fetched.length > 0) {
      if (notes.value.length > 0) {
        const newNotes = fetched.filter((n) => !noteIds.has(n.id))
        if (newNotes.length > 0) {
          setNotes(sortByCreatedAtDesc([...newNotes, ...notes.value]))
        }
      } else {
        setNotes(fetched)
      }
    }
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
  if (timeMachine.isActive.value) timeMachine.deactivate()
  setPaused(false)
  disconnect()
  resetBatch()
  isLoading.value = true
  setNotes([])
  tlType.value = type
  deckStore.updateColumn(props.column.id, { tl: type })
  refreshFilterKeys()
  await connect(true)
}

async function loadMore() {
  if (isLoading.value || notes.value.length === 0) return
  const lastNote = notes.value.at(-1)
  if (!lastNote) return

  // Time machine mode: load from local cache
  if (timeMachine.isActive.value) {
    isLoading.value = true
    try {
      const older = await timeMachine.loadMoreBefore(lastNote.createdAt)
      const filtered = older.filter((n) => n.id !== lastNote.id)
      if (filtered.length > 0)
        setNotes(sortByCreatedAtDesc([...notes.value, ...filtered]))
    } catch (e) {
      error.value = AppError.from(e)
    } finally {
      isLoading.value = false
    }
    return
  }

  // Normal mode: load from server
  const adapter = getAdapter()
  if (!adapter) return
  isLoading.value = true
  try {
    const filters = columnFilters.value
    const hasFilters = Object.keys(filters).length > 0
    const older = await adapter.api.getTimeline(tlType.value, {
      untilId: lastNote.id,
      ...(hasFilters ? { filters } : {}),
    })
    setNotes(sortByCreatedAtDesc([...notes.value, ...older]))
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

async function pullRefresh() {
  const adapter = getAdapter()
  if (!adapter || !account.value) return
  const sinceId = notes.value[0]?.id
  const fetched = await adapter.api.getTimeline(tlType.value, {
    ...(sinceId ? { sinceId } : {}),
    ...buildTimelineOptions(),
  })
  if (sinceId && fetched.length > 0) {
    const newNotes = fetched.filter((n) => !noteIds.has(n.id))
    if (newNotes.length > 0) {
      setNotes(sortByCreatedAtDesc([...newNotes, ...notes.value]))
    }
  } else if (fetched.length > 0) {
    setNotes(fetched)
  }
  scrollToTop()
}

const { pullDistance, isRefreshing } = usePullToRefresh(scroller, pullRefresh)

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

  if (timeMachine.isActive.value) return

  const adapter = getAdapter()
  if (!adapter || !account.value) return

  // Run cache fetch and API fetch in parallel (always fetch latest)
  const cachePromise = fetchCachedNotes()
  const apiPromise = adapter.api
    .getTimeline(tlType.value, buildTimelineOptions())
    .catch(() => [] as NormalizedNote[])

  const [cached, fetched] = await Promise.all([cachePromise, apiPromise])

  // Merge results: API results take priority, then cache
  const allNew = [...fetched, ...cached].filter((n) => !noteIds.has(n.id))
  if (allNew.length > 0) {
    // Deduplicate by id (API results first)
    const seen = new Set<string>()
    const deduped = allNew.filter((n) => {
      if (seen.has(n.id)) return false
      seen.add(n.id)
      return true
    })
    setNotes(sortByCreatedAtDesc([...deduped, ...notes.value]))
  }
}

onMounted(async () => {
  window.addEventListener('deck-resume', onResume)
  const host = account.value?.host
  const accountId = props.column.accountId
  // Clear stale policy cache so external mode changes are reflected
  if (accountId) clearAvailableTlCache(accountId)
  fetchAds()
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
    sound-enabled
    @header-click="scrollToTop()"
  >
    <template #header-icon>
      <span class="tl-header-icon-wrap">
        <i v-if="isTablerIcon(currentTlIcon)" :class="'ti ti-' + currentTlIcon" class="tl-header-icon" />
        <svg v-else class="tl-header-icon" viewBox="0 0 24 24" width="14" height="14">
          <path :d="currentTlIcon" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" fill="none" />
        </svg>
      </span>
    </template>

    <template #header-meta>
      <div v-if="account" class="header-account">
        <img v-if="account.avatarUrl" :src="account.avatarUrl" class="header-avatar" />
        <img class="header-favicon" :src="serverIconUrl || `https://${account.host}/favicon.ico`" :title="account.host" />
      </div>
    </template>

    <template #header-extra>
      <div ref="tabsRef" class="tl-tabs">
        <template v-if="timeMachine.isActive.value">
          <button class="_button tl-tab" @click="tmShiftDay(-1)">
            <i class="ti ti-chevron-left tl-tab-icon" />
          </button>
          <span class="tl-tab tl-tm-date active">{{ timeMachine.targetDate.value }}</span>
          <button class="_button tl-tab" @click="tmShiftDay(1)">
            <i class="ti ti-chevron-right tl-tab-icon" />
          </button>
          <button class="_button tl-tab tl-tm-live" @click="exitTimeMachine">
            <i class="ti ti-live-photo tl-tab-icon" />
            <span class="tl-tab-label">ライブ</span>
          </button>
        </template>
        <template v-else>
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
          <button
            class="_button tl-tab tl-timemachine-btn"
            title="Time Machine"
            @click.stop="toggleTimeMachine"
          >
            <i class="ti ti-history" />
          </button>
        </template>
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
      <div
        v-if="pullDistance > 0 || isRefreshing"
        class="pull-indicator"
        :style="{ height: pullDistance + 'px' }"
      >
        <i class="ti" :class="isRefreshing ? 'ti-loader-2 spin' : pullDistance >= 64 ? 'ti-arrow-down' : 'ti-arrow-down'" :style="{ opacity: Math.min(pullDistance / 64, 1), transform: pullDistance >= 64 && !isRefreshing ? 'rotate(180deg)' : '' }" />
      </div>

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

        <div v-if="notes.length === 0 && timeMachine.isActive.value" class="column-empty">
          No cached notes for this date
        </div>

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
            <MkAd v-if="shouldShowAd(index)" :ad="pickAd(index)!" :server-host="serverHost" @mute="muteAd" />
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

  <TimelineFilterPopup
    :show="showFilterMenu"
    :filter-keys="availableFilterKeys"
    :filters="columnFilters"
    :position="filterPopupPos"
    :theme-vars="columnThemeVars"
    @close="showFilterMenu = false"
    @toggle="toggleFilter"
  />
</template>

<style scoped>
@import './column-common.css';
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

.tl-timemachine-btn.active {
  color: var(--nd-accent);
}

.tl-header-icon-wrap {
  display: inline-flex;
  align-items: center;
}


.tl-tm-date {
  font-weight: bold;
  cursor: default;
}

.tl-tm-live {
  margin-left: auto;
  color: var(--nd-accent);
}

.pull-indicator {
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  flex-shrink: 0;
  color: var(--nd-accent);
  font-size: 1.2em;
  transition: height 0.2s ease;
}

.pull-indicator .ti {
  transition: transform 0.2s ease, opacity 0.2s ease;
}
</style>
