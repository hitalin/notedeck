<script setup lang="ts">
import { computed, nextTick, onMounted, ref, useCssModule, watch } from 'vue'
import type {
  NormalizedNote,
  TimelineFilter,
  TimelineType,
} from '@/adapters/types'
import MkAd from '@/components/common/MkAd.vue'
import { useAds } from '@/composables/useAds'
import type { NoteColumnConfig } from '@/composables/useNoteColumn'
import { useSwipeTab } from '@/composables/useSwipeTab'
import { useTabIndicator } from '@/composables/useTabIndicator'
import { useTabSlide } from '@/composables/useTabSlide'
import { useAccountsStore } from '@/stores/accounts'
import type { DeckColumn as DeckColumnType } from '@/stores/deck'
import { useDeckStore } from '@/stores/deck'
import type { CustomTimelineInfo } from '@/utils/customTimelines'
import {
  clearAvailableTlCache,
  clearRuntimeDenied,
  detectAvailableTimelines,
  detectCustomTimelines,
  detectFilterKeys,
  findModeKeyForTimeline,
  getRelatedTimelineTypes,
  markTimelineDenied,
} from '@/utils/customTimelines'
import { matchesFilter } from '@/utils/timelineFilter'
import DeckNoteColumn from './DeckNoteColumn.vue'
import TimelineFilterPopup from './TimelineFilterPopup.vue'

const props = defineProps<{
  column: DeckColumnType
}>()

const deckStore = useDeckStore()
const accountsStore = useAccountsStore()

// Guest accounts can only access public timelines (local/global), not home
const accountData = accountsStore.accountMap.get(props.column.accountId ?? '')
const defaultTl: TimelineType =
  accountData?.hasToken === false ? 'local' : 'home'
const tlType = ref<TimelineType>(props.column.tl || defaultTl)

// --- Filter ---
const columnFilters = computed<TimelineFilter>(() => props.column.filters ?? {})

function buildTimelineOptions() {
  const filters = columnFilters.value
  const hasFilters = Object.keys(filters).length > 0
  return {
    ...(hasFilters ? { filters } : {}),
  }
}

// --- Connect readiness: wait for policy detection before connecting ---
const connectReady = ref(false)

// --- NoteColumnConfig ---

const noteColumnConfig: NoteColumnConfig = {
  connectReady,
  getColumn: () => props.column,
  fetch: async (adapter, opts) => {
    try {
      return await adapter.api.getTimeline(tlType.value, {
        ...opts,
        ...buildTimelineOptions(),
      })
    } catch (e) {
      // Handle "disabled" timeline errors: remove related TL tabs and switch
      if (String(e).includes('disabled')) {
        const aid = props.column.accountId
        const related = new Set(getRelatedTimelineTypes(tlType.value))
        if (aid) {
          for (const t of related) markTimelineDenied(aid, t)
        }
        availableStandardTl.value = availableStandardTl.value.filter(
          (t) => !related.has(t),
        )
        switchTl(availableStandardTl.value[0] ?? 'home')
        return []
      }
      throw e
    }
  },
  cache: {
    getKey: () => tlType.value,
  },
  streaming: {
    subscribe: (adapter, enqueue, callbacks) =>
      adapter.stream.subscribeTimeline(
        tlType.value,
        (note: NormalizedNote) => {
          if (!matchesFilter(note, columnFilters.value, tlType.value)) return
          enqueue(note)
        },
        callbacks,
      ),
  },
  filterCachedNotes: (cached) =>
    cached.filter((n) => matchesFilter(n, columnFilters.value, tlType.value)),
}

// --- DeckNoteColumn ref (expose: account, scroller, reconnect, switchWithSnapshot, notes, columnThemeVars) ---
const noteColumnRef = ref<InstanceType<typeof DeckNoteColumn> | null>(null)
const account = computed(() => noteColumnRef.value?.account)
const columnThemeVars = computed(
  () => noteColumnRef.value?.columnThemeVars ?? {},
)
const swipeTarget = computed<HTMLElement | null>(
  () => (noteColumnRef.value?.scroller as HTMLElement | undefined) ?? null,
)

async function reconnect() {
  await noteColumnRef.value?.reconnect()
}

// --- Ads ---
const { fetchAds, pickAd, shouldShowAd, muteAd, serverHost } = useAds(
  () => props.column.accountId ?? undefined,
)

// --- TL type definitions ---
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
const policyLoaded = ref(false)

const allTlTypes = computed(() => {
  if (!connectReady.value) return [] // Policy detection not yet complete
  if (!policyLoaded.value) return TL_TYPES.map((t) => t) // No account — show all
  const allowed = availableStandardTl.value
  if (allowed.length === 0) {
    // Policies loaded but nothing available — show home only as safe fallback
    return TL_TYPES.filter((t) => t.value === 'home')
  }
  const allowedSet = new Set(allowed)
  const standard = TL_TYPES.filter((t) => allowedSet.has(t.value))
  for (const ct of customTimelines.value) {
    if (allowedSet.has(ct.type)) {
      standard.push({ value: ct.type, label: ct.label })
    }
  }
  return standard
})

// Tab slide animation
const tlTabIndex = computed(() => {
  const types = allTlTypes.value
  return types.findIndex((t) => t.value === tlType.value)
})
useTabSlide(tlTabIndex, swipeTarget)

function getTlIcon(type: string): string {
  if (TL_ICONS[type]) return TL_ICONS[type]
  const ct = customTimelines.value.find((t) => t.type === type)
  return ct?.icon ?? TL_ICONS.home ?? ''
}

// --- Filter UI ---
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
    next[key] = current === true ? undefined : true
  } else {
    next[key] = current === false ? undefined : false
  }
  for (const k of Object.keys(next) as (keyof TimelineFilter)[]) {
    if (next[k] === undefined) delete next[k]
  }
  deckStore.updateColumn(props.column.id, {
    filters: Object.keys(next).length > 0 ? next : undefined,
  })
  reconnect()
}

// --- Tab slide indicator ---
const $style = useCssModule()
const tabsRef = ref<HTMLElement | null>(null)
const { indicatorStyle: tabIndicatorStyle } = useTabIndicator(
  tabsRef,
  `.tl-tab.${$style.active}`,
  () => tlType.value,
)

// --- TL switching ---

interface TlSnapshot {
  notes: NormalizedNote[]
  scrollTop: number
}
const SNAPSHOT_MAX_NOTES = 30
const tlSnapshots = new Map<TimelineType, TlSnapshot>()

async function switchTl(type: TimelineType) {
  if (type === tlType.value) return

  // Save current tab snapshot (limit stored notes to reduce memory)
  const col = noteColumnRef.value
  if (col) {
    tlSnapshots.set(tlType.value, {
      notes: (col.notes ?? []).slice(0, SNAPSHOT_MAX_NOTES),
      scrollTop: (col.scroller as HTMLElement | undefined)?.scrollTop ?? 0,
    })
  }

  tlType.value = type
  deckStore.updateColumn(props.column.id, { tl: type })
  refreshFilterKeys()

  // Restore snapshot if available, otherwise full reconnect
  const snapshot = tlSnapshots.get(type)
  if (snapshot && snapshot.notes.length > 0) {
    await col?.switchWithSnapshot(snapshot.notes, snapshot.scrollTop)
  } else {
    await reconnect()
  }
}

// --- Policies ---

async function applyPolicies(accountId: string, host: string) {
  const [ct, availability] = await Promise.all([
    detectCustomTimelines(host),
    detectAvailableTimelines(accountId),
  ])
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
  policyLoaded.value = true
}

async function refreshPolicies() {
  const accountId = props.column.accountId
  const host =
    account.value?.host ?? accountsStore.accountMap.get(accountId ?? '')?.host
  if (!accountId || !host) return
  clearAvailableTlCache(accountId)
  await applyPolicies(accountId, host)
}

// --- Swipe to switch timeline tabs ---
useSwipeTab(
  swipeTarget,
  () => {
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

// --- Mode version watch (per-account: only react to this column's account) ---
watch(
  () => {
    const aid = props.column.accountId
    return aid ? accountsStore.getModeVersion(aid) : -1
  },
  async () => {
    const accountId = props.column.accountId
    if (accountId) clearRuntimeDenied(accountId)
    await refreshPolicies()
    if (!availableStandardTl.value.includes(tlType.value)) {
      switchTl(availableStandardTl.value[0] ?? 'local')
    } else {
      await reconnect()
    }
  },
)

// --- Startup: detect policies and custom TLs ---
onMounted(async () => {
  const accountId = props.column.accountId

  // Wait for accounts to load so accountMap is populated.
  // Without this, host is undefined in production (Tauri IPC is slower),
  // which skips the policy check and connects with an unauthorized TL type.
  if (!accountsStore.isLoaded) {
    await accountsStore.loadAccounts()
  }

  const host = accountId
    ? accountsStore.accountMap.get(accountId)?.host
    : undefined
  fetchAds()
  try {
    if (host && accountId) {
      await Promise.all([applyPolicies(accountId, host), refreshFilterKeys()])
      if (!availableStandardTl.value.includes(tlType.value)) {
        // Only update tlType synchronously here — full reconnect will happen
        // via connectReady watcher in useNoteColumn, avoiding a double-connect race.
        const fallback = availableStandardTl.value[0] ?? 'local'
        tlType.value = fallback
        deckStore.updateColumn(props.column.id, { tl: fallback })
      }
    }
  } catch (e) {
    // Policy detection failed — show all tabs as fallback so the column
    // remains usable. Individual tabs will be removed at runtime if disabled.
    console.warn('[DeckTimelineColumn] policy detection failed:', e)
  }
  connectReady.value = true
})
</script>

<template>
  <DeckNoteColumn
    ref="noteColumnRef"
    :column="column"
    title="タイムライン"
    icon="ti-home"
    sound-enabled
    :note-column-config="noteColumnConfig"
  >
    <template #header-icon>
      <span :class="$style.tlHeaderIconWrap">
        <i v-if="isTablerIcon(currentTlIcon)" :class="['ti ti-' + currentTlIcon, $style.tlHeaderIcon]" />
        <svg v-else :class="$style.tlHeaderIcon" viewBox="0 0 24 24" width="14" height="14">
          <path :d="currentTlIcon" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" fill="none" />
        </svg>
      </span>
    </template>

    <template #header-extra>
      <div ref="tabsRef" :class="$style.tlTabs">
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
        <div :class="$style.tlTabIndicator" :style="tabIndicatorStyle" />
      </div>
    </template>

    <template #note-item="{ index }">
      <MkAd v-if="shouldShowAd(index)" :ad="pickAd(index)!" :server-host="serverHost" @mute="muteAd" />
    </template>
  </DeckNoteColumn>

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
  left: 0;
  width: 1px;
  height: 3px;
  background: var(--nd-accent);
  border-radius: var(--nd-radius-full) var(--nd-radius-full) 0 0;
  transition: translate var(--nd-duration-slower) var(--nd-ease-pop), scale var(--nd-duration-slower) var(--nd-ease-pop), opacity var(--nd-duration-slower) var(--nd-ease-pop);
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

.tlHeaderIconWrap {
  display: inline-flex;
  align-items: center;
}

.tlHeaderIcon {
  font-size: 14px;
}
</style>
