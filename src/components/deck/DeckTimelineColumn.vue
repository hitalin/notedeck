<script setup lang="ts">
import { invoke } from '@tauri-apps/api/core'
import {
  computed,
  defineAsyncComponent,
  nextTick,
  onMounted,
  onUnmounted,
  ref,
  useCssModule,
  watch,
} from 'vue'
import type {
  NormalizedNote,
  TimelineFilter,
  TimelineType,
} from '@/adapters/types'
import MkAd from '@/components/common/MkAd.vue'
import MkNote from '@/components/common/MkNote.vue'
import NoteScroller from '@/components/common/NoteScroller.vue'
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
import { useSwipeTab } from '@/composables/useSwipeTab'
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
import { insertIntoSorted } from '@/utils/sortNotes'
import { matchesFilter } from '@/utils/timelineFilter'
import DeckColumn from './DeckColumn.vue'
import TimelineFilterPopup from './TimelineFilterPopup.vue'

const props = defineProps<{
  column: DeckColumnType
}>()

const noteScroller = ref<{ getElement: () => HTMLElement | null } | null>(null)

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
  disposeSubscription,
  disconnect,
  postForm,
  handlers,
  scroller,
  onScroll,
} = useColumnSetup(() => props.column, {
  isOffline: () => isOffline.value,
})

// Sync NoteScroller's scroll container element to the scroller ref used by composables
watch(
  noteScroller,
  () => {
    scroller.value = noteScroller.value?.getElement() ?? null
  },
  { flush: 'post' },
)

const { navigateToNote } = useNavigation()
const { fetchAds, pickAd, shouldShowAd, muteAd, serverHost } = useAds(
  () => props.column.accountId ?? undefined,
)
const {
  notes,
  noteIds,
  setNotes,
  mergeIfSameList,
  onNoteUpdate,
  handlePosted,
  removeNote,
} = useNoteList({
  getMyUserId: () => account.value?.userId,
  getAdapter,
  deleteHandler: handlers.delete,
  closePostForm: postForm.close,
})

const noteSound = useNoteSound(() => account.value?.host)
const {
  pendingNotes,
  isAtTop,
  animateEnter,
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
          setNotes(insertIntoSorted(notes.value, newNotes))
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

/** True when API is unreachable and displaying cached notes */
const isOffline = ref(false)

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
const $style = useCssModule()
const tabsRef = ref<HTMLElement | null>(null)
const tabIndicatorStyle = ref({ left: '0px', width: '0px', opacity: '0' })

function updateTabIndicator() {
  if (!tabsRef.value) return
  const activeTab = tabsRef.value.querySelector(
    `.tl-tab.${$style.active}`,
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

// When account loses token (logout with keep-data), switch to cache display
watch(
  () => account.value?.hasToken,
  async (hasToken, prev) => {
    if (prev && hasToken === false) {
      disposeSubscription()
      resetBatch()
      const cached = await fetchCachedNotes()
      const filtered = cached.filter((n) =>
        matchesFilter(n, columnFilters.value, tlType.value),
      )
      if (filtered.length > 0) setNotes(filtered)
      isOffline.value = true
      isLoading.value = false
    }
  },
)

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
  disposeSubscription()
  resetBatch()
  setNotes([])
  isLoading.value = true

  // Logged-out: reload from cache with new filter
  if (account.value && !account.value.hasToken) {
    const cached = await fetchCachedNotes()
    const filtered = cached.filter((n) =>
      matchesFilter(n, columnFilters.value, tlType.value),
    )
    if (filtered.length > 0) setNotes(filtered)
    isOffline.value = true
    isLoading.value = false
    return
  }

  try {
    const adapter = getAdapter() ?? (await initAdapter())
    if (!adapter) return

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

    const dedupKey = `${props.column.accountId}:timeline:${tlType.value}`
    const fetched = await dedup(dedupKey, () =>
      adapter.api.getTimeline(tlType.value, buildTimelineOptions()),
    )

    if (fetched.length > 0) {
      setNotes(fetched)
    }
    isOffline.value = false
  } catch (e) {
    const err = AppError.from(e)
    if (String(err.message).includes('disabled')) {
      await refreshPolicies()
      if (!availableStandardTl.value.includes(tlType.value)) {
        switchTl('home')
        return
      }
    }
    if (notes.value.length > 0) {
      isOffline.value = true
    } else {
      const cached = await fetchCachedNotes()
      const filtered = cached.filter((n) =>
        matchesFilter(n, columnFilters.value, tlType.value),
      )
      if (filtered.length > 0) {
        setNotes(filtered)
        isOffline.value = true
      } else {
        error.value = err
      }
    }
  } finally {
    isLoading.value = false
  }
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
    const filtered = cached.filter((n) =>
      matchesFilter(n, columnFilters.value, tlType.value),
    )
    setNotes(filtered)
  }

  // Logged-out account: show cached notes in read-only mode
  if (account.value && !account.value.hasToken) {
    isOffline.value = true
    isLoading.value = false
    return
  }

  try {
    const adapter = await initAdapter()
    if (!adapter) return

    // Start streaming setup immediately (connect + subscribe in single IPC).
    // Runs in parallel with the API fetch below.
    adapter.stream.connect()
    adapter.stream.on('disconnected', () => {
      isOffline.value = true
    })
    adapter.stream.on('reconnecting', () => {
      isOffline.value = true
    })
    adapter.stream.on('connected', () => {
      isOffline.value = false
    })
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
      if (useCache || notes.value.length === 0) {
        // 再接続時: キャッシュと同じ構成ならノート内容だけ更新（レイアウトシフト防止）
        if (!mergeIfSameList(fetched)) {
          setNotes(fetched)
        }
      } else {
        // 初回接続時: ストリーミング受信済みノートとマージ
        const newNotes = fetched.filter((n) => !noteIds.has(n.id))
        if (newNotes.length > 0) {
          setNotes(insertIntoSorted(notes.value, newNotes))
        }
      }
    }
    isOffline.value = false
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
    if (notes.value.length > 0) {
      isOffline.value = true
    } else {
      // No notes loaded yet — try cache before showing error
      const cached = await fetchCachedNotes()
      const filtered = cached.filter((n) =>
        matchesFilter(n, columnFilters.value, tlType.value),
      )
      if (filtered.length > 0) {
        setNotes(filtered)
        isOffline.value = true
      } else {
        error.value = err
      }
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
  await connect(false)
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
      if (filtered.length > 0) setNotes(insertIntoSorted(notes.value, filtered))
    } catch (e) {
      error.value = AppError.from(e)
    } finally {
      isLoading.value = false
    }
    return
  }

  // Offline mode: load from cache
  if (isOffline.value) {
    isLoading.value = true
    try {
      if (props.column.accountId) {
        const older = await invoke<NormalizedNote[]>(
          'api_get_cached_timeline_before',
          {
            accountId: props.column.accountId,
            timelineType: tlType.value,
            before: lastNote.createdAt,
            limit: 40,
          },
        )
        if (older.length > 0) setNotes(insertIntoSorted(notes.value, older))
      }
    } catch {
      /* cache read failure is non-critical */
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
    setNotes(insertIntoSorted(notes.value, older))
  } catch {
    // API failed: switch to offline cache mode
    isOffline.value = true
    if (props.column.accountId) {
      try {
        const older = await invoke<NormalizedNote[]>(
          'api_get_cached_timeline_before',
          {
            accountId: props.column.accountId,
            timelineType: tlType.value,
            before: lastNote.createdAt,
            limit: 40,
          },
        )
        if (older.length > 0) setNotes(insertIntoSorted(notes.value, older))
      } catch {
        /* fallback failure */
      }
    }
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
  try {
    const fetched = await adapter.api.getTimeline(tlType.value, {
      ...(sinceId ? { sinceId } : {}),
      ...buildTimelineOptions(),
    })
    if (sinceId && fetched.length > 0) {
      const newNotes = fetched.filter((n) => !noteIds.has(n.id))
      if (newNotes.length > 0) {
        setNotes(insertIntoSorted(notes.value, newNotes))
      }
    } else if (fetched.length > 0) {
      setNotes(fetched)
    }
    isOffline.value = false
  } catch {
    isOffline.value = true
  }
  scrollToTop()
}

const { isPulling, isPulledEnough, isRefreshing, pullDistance, displayHeight } =
  usePullToRefresh(scroller, pullRefresh)

// Swipe to switch timeline tabs
useSwipeTab(
  scroller,
  () => {
    // swipe left → next tab
    if (timeMachine.isActive.value) return false
    const types = allTlTypes.value
    const idx = types.findIndex((t) => t.value === tlType.value)
    const next = idx >= 0 && idx < types.length - 1 ? types[idx + 1] : undefined
    if (next) {
      switchTl(next.value)
      return true
    }
    return false
  },
  () => {
    // swipe right → previous tab
    if (timeMachine.isActive.value) return false
    const types = allTlTypes.value
    const idx = types.findIndex((t) => t.value === tlType.value)
    const prev = idx > 0 ? types[idx - 1] : undefined
    if (prev) {
      switchTl(prev.value)
      return true
    }
    return false
  },
)

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

  // Logged-out: skip API, no-op (cache is already loaded)
  if (account.value && !account.value.hasToken) return

  const adapter = getAdapter()
  if (!adapter || !account.value) return

  // Run cache fetch and API fetch in parallel (always fetch latest)
  const cachePromise = fetchCachedNotes()
  let apiFailed = false
  const apiPromise = adapter.api
    .getTimeline(tlType.value, buildTimelineOptions())
    .catch(() => {
      apiFailed = true
      return [] as NormalizedNote[]
    })

  const [cached, fetched] = await Promise.all([cachePromise, apiPromise])
  isOffline.value = apiFailed

  // Merge results: API results take priority, then cache (with filter)
  const filteredCache = cached.filter((n) =>
    matchesFilter(n, columnFilters.value, tlType.value),
  )
  const allNew = [...fetched, ...filteredCache].filter(
    (n) => !noteIds.has(n.id),
  )
  if (allNew.length > 0) {
    // Deduplicate by id (API results first)
    const seen = new Set<string>()
    const deduped = allNew.filter((n) => {
      if (seen.has(n.id)) return false
      seen.add(n.id)
      return true
    })
    setNotes(insertIntoSorted(notes.value, deduped))
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
    title="タイムライン"
    :theme-vars="columnThemeVars"
    sound-enabled
    @header-click="scrollToTop()"
  >
    <template #header-icon>
      <span :class="$style.tlHeaderIconWrap">
        <i v-if="isTablerIcon(currentTlIcon)" :class="['ti ti-' + currentTlIcon, $style.tlHeaderIcon]" />
        <svg v-else :class="$style.tlHeaderIcon" viewBox="0 0 24 24" width="14" height="14">
          <path :d="currentTlIcon" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" fill="none" />
        </svg>
      </span>
    </template>

    <template #header-meta>
      <div v-if="account" :class="$style.headerAccount">
        <img v-if="account.avatarUrl" :src="account.avatarUrl" :class="$style.headerAvatar" />
        <img :class="$style.headerFavicon" :src="serverIconUrl || `https://${account.host}/favicon.ico`" :title="account.host" />
      </div>
    </template>

    <template #header-extra>
      <div ref="tabsRef" :class="$style.tlTabs">
        <template v-if="timeMachine.isActive.value">
          <button class="_button tl-tab" :class="$style.tlTab" @click="tmShiftDay(-1)">
            <i class="ti ti-chevron-left" :class="$style.tlTabIcon" />
          </button>
          <span class="tl-tab" :class="[$style.tlTab, $style.tlTmDate, $style.active]">{{ timeMachine.targetDate.value }}</span>
          <button class="_button tl-tab" :class="$style.tlTab" @click="tmShiftDay(1)">
            <i class="ti ti-chevron-right" :class="$style.tlTabIcon" />
          </button>
          <button class="_button tl-tab" :class="[$style.tlTab, $style.tlTmLive]" @click="exitTimeMachine">
            <i class="ti ti-live-photo" :class="$style.tlTabIcon" />
            <span :class="$style.tlTabLabel">ライブ</span>
          </button>
        </template>
        <template v-else>
          <button
            v-for="opt in allTlTypes"
            :key="opt.value"
            class="_button tl-tab"
            :class="[$style.tlTab, { [$style.active]: tlType === opt.value }]"
            :title="opt.label"
            @click="switchTl(opt.value)"
          >
            <i v-if="isTablerIcon(getTlIcon(opt.value))" :class="['ti ti-' + getTlIcon(opt.value), $style.tlTabIcon]" />
            <svg v-else :class="$style.tlTabIcon" viewBox="0 0 24 24" width="16" height="16">
              <path :d="getTlIcon(opt.value)" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" fill="none" />
            </svg>
            <span v-if="tlType === opt.value" :class="$style.tlTabLabel">{{ opt.label }}</span>
          </button>
          <button
            v-if="availableFilterKeys.length > 0"
            ref="filterBtnRef"
            class="_button tl-tab"
            :class="[$style.tlTab, $style.tlFilterBtn, { [$style.active]: hasActiveFilter }]"
            title="Filter"
            @click.stop="toggleFilterMenu"
          >
            <i class="ti ti-filter" />
          </button>
          <button
            class="_button tl-tab"
            :class="[$style.tlTab, $style.tlTimemachineBtn]"
            title="Time Machine"
            @click.stop="toggleTimeMachine"
          >
            <i class="ti ti-history" />
          </button>
        </template>
        <div :class="$style.tlTabIndicator" :style="tabIndicatorStyle" />
      </div>
    </template>

    <div v-if="!account" :class="$style.columnEmpty">
      Account not found
    </div>

    <div v-else-if="error" :class="[$style.columnEmpty, $style.columnError]">
      {{ error.message }}
    </div>

    <div v-else :class="$style.tlBody">
      <div
        v-if="isPulling"
        :class="$style.pullFrame"
        :style="`--frame-min-height: ${displayHeight()}px`"
      >
        <div :class="$style.pullFrameContent">
          <i v-if="isRefreshing" class="ti ti-loader-2" :class="$style.spin" />
          <i v-else class="ti ti-arrow-bar-to-down" :class="{ refresh: isPulledEnough }" />
          <div :class="$style.pullText">
            <template v-if="isPulledEnough">離してリフレッシュ</template>
            <template v-else-if="isRefreshing">リフレッシュ中…</template>
            <template v-else>下に引いてリフレッシュ</template>
          </div>
        </div>
      </div>

      <div v-if="isOffline" :class="$style.offlineBanner">
        <i class="ti ti-cloud-off" />オフライン
      </div>

      <div v-if="isLoading && notes.length === 0">
        <MkSkeleton v-for="i in 5" :key="i" />
      </div>

      <template v-else>
        <div v-if="notes.length === 0 && timeMachine.isActive.value" :class="$style.columnEmpty">
          No cached notes for this date
        </div>

        <button
          v-if="pendingNotes.length > 0"
          :class="$style.newNotesBanner"
          class="_button"
          @click="scrollToTop()"
        >
          <i class="ti ti-arrow-up" />{{ pendingNotes.length }}件の新しいノート
        </button>

        <NoteScroller
          ref="noteScroller"
          :items="notes"
          :focused-id="focusedNoteId"
          :animate="animateEnter"
          :class="$style.tlScroller"
          @scroll="handleScroll"
        >
          <template #default="{ item, index }">
            <div :data-index="index">
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
              <MkAd v-if="shouldShowAd(index)" :ad="pickAd(index)!" :server-host="serverHost" @mute="muteAd" />
            </div>
          </template>

          <template #append>
            <div v-if="isLoading && notes.length > 0" :class="$style.loadingMore">
              Loading...
            </div>
          </template>
        </NoteScroller>
      </template>
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

<style lang="scss" module>
@use './column-common.module.scss';

.tlTabs {
  display: flex;
  position: relative;
  border-bottom: 1px solid var(--nd-divider);
  background: var(--nd-bg);
}

.tlTab {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  padding: 8px 12px;
  opacity: 0.4;
  transition: opacity var(--nd-duration-base), background var(--nd-duration-base);
  position: relative;

  &:hover {
    opacity: 0.7;
    background: var(--nd-buttonHoverBg);
  }

  &.active {
    opacity: 1;
  }
}

.tlTabIndicator {
  position: absolute;
  bottom: 0;
  height: 3px;
  background: var(--nd-accent);
  border-radius: var(--nd-radius-full) var(--nd-radius-full) 0 0;
  transition: left var(--nd-duration-slower) cubic-bezier(0, 0, 0.2, 1), width var(--nd-duration-slower) cubic-bezier(0, 0, 0.2, 1);
  pointer-events: none;
}

.tlTabIcon {
  color: currentColor;
}

.tlTabLabel {
  font-size: 0.85em;
  font-weight: bold;
  white-space: nowrap;
}

.tlFilterBtn {
  margin-left: auto;

  &.active {
    color: var(--nd-accent);
  }
}

.tlTimemachineBtn {
  &.active {
    color: var(--nd-accent);
  }
}

.tlHeaderIconWrap {
  display: inline-flex;
  align-items: center;
}

.tlTmDate {
  font-weight: bold;
  cursor: default;
}

.tlTmLive {
  margin-left: auto;
  color: var(--nd-accent);
}

</style>
