<script setup lang="ts">
import { invoke } from '@tauri-apps/api/core'
import { emit } from '@tauri-apps/api/event'
import { getCurrentWindow } from '@tauri-apps/api/window'
import {
  computed,
  nextTick,
  onMounted,
  onUnmounted,
  ref,
  useCssModule,
  watch,
} from 'vue'
import { useRoute } from 'vue-router'
import { initAdapterFor } from '@/adapters/initAdapter'
import type {
  ChannelSubscription,
  NormalizedNote,
  NoteUpdateEvent,
  ServerAdapter,
  TimelineFilter,
  TimelineType,
} from '@/adapters/types'
import MkAvatar from '@/components/common/MkAvatar.vue'
import MkMfm from '@/components/common/MkMfm.vue'
import TimelineFilterPopup from '@/components/deck/TimelineFilterPopup.vue'
import { useTimeMachine } from '@/composables/useTimeMachine'
import { useAccountsStore } from '@/stores/accounts'
import { useNoteStore } from '@/stores/notes'
import { useServersStore } from '@/stores/servers'
import { useThemeStore } from '@/stores/theme'
import type { CustomTimelineInfo } from '@/utils/customTimelines'
import {
  clearAvailableTlCache,
  detectAvailableTimelines,
  detectCustomTimelines,
  detectFilterKeys,
  findModeKeyForTimeline,
} from '@/utils/customTimelines'
import { formatTime } from '@/utils/formatTime'
import { insertIntoSorted } from '@/utils/sortNotes'
import { matchesFilter } from '@/utils/timelineFilter'

const noteStore = useNoteStore()
const MAX_NOTES = 30

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

function getTlIcon(type: string): string {
  if (TL_ICONS[type]) return TL_ICONS[type]
  const ct = customTimelines.value.find((t) => t.type === type)
  return ct?.icon ?? TL_ICONS.home ?? ''
}

const route = useRoute()
const accountsStore = useAccountsStore()
const serversStore = useServersStore()
const themeStore = useThemeStore()

const currentAccountId = ref(route.query.accountId as string)
const currentTimeline = ref<TimelineType>(
  (route.query.timeline as TimelineType) || 'home',
)
const showAccountMenu = ref(false)

const account = computed(() =>
  accountsStore.accounts.find((a) => a.id === currentAccountId.value),
)
const themeVars = computed(() =>
  currentAccountId.value
    ? themeStore.getStyleVarsForAccount(currentAccountId.value)
    : undefined,
)

const currentTlIcon = computed(
  () => TL_ICONS[currentTimeline.value] ?? customTlIcon.value ?? 'home',
)

const notes = ref<NormalizedNote[]>([])
const noteIds = new Set<string>()
const serverIconUrl = ref<string | undefined>()
const serverIcons = ref<Map<string, string>>(new Map())
const error = ref<string | null>(null)
let subscription: ChannelSubscription | null = null
let adapter: ServerAdapter | null = null
let pendingNotes: NormalizedNote[] = []
let flushTimer: ReturnType<typeof setTimeout> | null = null

// --- Custom timelines & policies ---
const customTimelines = ref<CustomTimelineInfo[]>([])
const availableStandardTl = ref<string[]>([])
const customTlIcon = computed(() => {
  const ct = customTimelines.value.find((t) => t.type === currentTimeline.value)
  return ct?.icon
})
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

// --- Tab slide indicator ---
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

watch(currentTimeline, () => nextTick(updateTabIndicator))
onMounted(() => nextTick(updateTabIndicator))

// --- Time Machine ---
const timeMachine = useTimeMachine(
  () => currentAccountId.value,
  () => currentTimeline.value,
)

async function toggleTimeMachine() {
  if (timeMachine.isActive.value) {
    exitTimeMachine()
    return
  }
  // Pause streaming
  subscription?.dispose()
  subscription = null
  if (flushTimer) {
    clearTimeout(flushTimer)
    flushTimer = null
  }
  pendingNotes = []
  try {
    await timeMachine.loadDateRange()
    if (timeMachine.dateRange.value) {
      const cached = await timeMachine.jumpToDate(
        timeMachine.dateRange.value.max.slice(0, 10),
      )
      notes.value = cached
      noteIds.clear()
      for (const n of cached) noteIds.add(n.id)
    } else {
      // No cache — reconnect
      startTimeline(currentTimeline.value)
    }
  } catch (e) {
    console.error('[pip:time-machine] failed to activate:', e)
    startTimeline(currentTimeline.value)
  }
}

async function onTimeMachineDateChange(date: string) {
  try {
    const cached = await timeMachine.jumpToDate(date)
    notes.value = cached
    noteIds.clear()
    for (const n of cached) noteIds.add(n.id)
  } catch (e) {
    console.error('[pip:time-machine] jumpToDate failed:', e)
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
  notes.value = []
  noteIds.clear()
  startTimeline(currentTimeline.value)
}

// --- Filter ---
const showFilterMenu = ref(false)
const filterBtnRef = ref<HTMLButtonElement | null>(null)
const filterPopupPos = ref({ top: 0, left: 0 })
const availableFilterKeys = ref<(keyof TimelineFilter)[]>([])
const filters = ref<TimelineFilter>({})

const hasActiveFilter = computed(() => {
  return Object.values(filters.value).some((v) => v !== undefined)
})

async function refreshFilterKeys() {
  const host = account.value?.host
  if (!host) {
    availableFilterKeys.value = []
    return
  }
  availableFilterKeys.value = await detectFilterKeys(
    host,
    currentTimeline.value,
  )
}

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
  const current = filters.value[key]
  const next = { ...filters.value }
  if (key === 'withFiles') {
    next[key] = current === true ? undefined : true
  } else {
    next[key] = current === false ? undefined : false
  }
  for (const k of Object.keys(next) as (keyof TimelineFilter)[]) {
    if (next[k] === undefined) delete next[k]
  }
  filters.value = next
  // Reconnect to apply filter
  startTimeline(currentTimeline.value)
}

function buildTimelineOptions() {
  const f = filters.value
  const hasFilters = Object.keys(f).length > 0
  return {
    limit: MAX_NOTES,
    ...(hasFilters ? { filters: f } : {}),
  }
}

// --- Policies ---
async function refreshPolicies() {
  const accountId = currentAccountId.value
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

// --- Timeline ---
async function startTimeline(tl: TimelineType) {
  const acc = account.value
  if (!acc) {
    error.value = 'アカウントが見つかりません'
    return
  }

  // Clean up previous subscription
  subscription?.dispose()
  subscription = null
  if (flushTimer) {
    clearTimeout(flushTimer)
    flushTimer = null
  }
  pendingNotes = []
  notes.value = []
  noteIds.clear()
  error.value = null
  currentTimeline.value = tl

  try {
    if (!adapter) {
      const result = await initAdapterFor(acc.host, acc.id, {
        pinnedReactions: false,
      })
      serverIconUrl.value = result.serverInfo.iconUrl
      adapter = result.adapter
    }

    // Initial fetch
    const fetched = await adapter.api.getTimeline(tl, buildTimelineOptions())
    noteStore.put(fetched)
    for (const n of fetched) noteIds.add(n.id)
    notes.value = fetched

    // Streaming (batched)
    adapter.stream.connect()
    subscription = adapter.stream.subscribeTimeline(
      tl,
      (note: NormalizedNote) => {
        if (noteIds.has(note.id)) return
        if (!matchesFilter(note, filters.value, tl)) return
        noteStore.put([note])
        noteIds.add(note.id)
        pendingNotes.push(note)
        if (!flushTimer) {
          flushTimer = setTimeout(() => {
            flushTimer = null
            if (pendingNotes.length === 0) return
            const merged = insertIntoSorted(notes.value, pendingNotes)
            pendingNotes = []
            notes.value =
              merged.length > MAX_NOTES ? merged.slice(0, MAX_NOTES) : merged
          }, 200)
        }
      },
      {
        onNoteUpdated: (event: NoteUpdateEvent) => {
          noteStore.applyUpdate(event, acc.userId)
        },
      },
    )
  } catch (e) {
    error.value = String(e)
  }
}

async function switchTl(type: TimelineType) {
  if (type === currentTimeline.value) return
  if (timeMachine.isActive.value) timeMachine.deactivate()
  refreshFilterKeys()
  await startTimeline(type)
}

async function switchAccount(id: string) {
  if (id === currentAccountId.value) {
    showAccountMenu.value = false
    return
  }
  showAccountMenu.value = false
  subscription?.dispose()
  subscription = null
  adapter = null
  currentAccountId.value = id
  const acc = accountsStore.accounts.find((a) => a.id === id)
  if (acc) {
    serverIconUrl.value = serverIcons.value.get(acc.host)
  }
  // Refresh policies for new account
  await refreshPolicies()
  refreshFilterKeys()
  if (!availableStandardTl.value.includes(currentTimeline.value)) {
    await startTimeline('home')
  } else {
    await startTimeline(currentTimeline.value)
  }
}

function toggleAccountMenu() {
  if (accountsStore.accounts.length <= 1) return
  showAccountMenu.value = !showAccountMenu.value
}

function onNoteClick(note: NormalizedNote) {
  emit('pip:open-note', {
    accountId: currentAccountId.value,
    noteId: note.id,
  })
}

async function closeWindow() {
  const win = getCurrentWindow()
  await win.close()
}

async function loadServerIcons() {
  for (const acc of accountsStore.accounts) {
    if (serverIcons.value.has(acc.host)) continue
    try {
      const info = await serversStore.getServerInfo(acc.host)
      if (info.iconUrl) {
        serverIcons.value.set(acc.host, info.iconUrl)
      }
    } catch {
      // ignore
    }
  }
}

async function loadMoreTimeMachine() {
  if (notes.value.length === 0) return
  const lastNote = notes.value.at(-1)
  if (!lastNote) return
  try {
    const older = await timeMachine.loadMoreBefore(lastNote.createdAt)
    const filtered = older.filter((n) => n.id !== lastNote.id)
    if (filtered.length > 0) {
      notes.value = insertIntoSorted(notes.value, filtered)
      for (const n of filtered) noteIds.add(n.id)
    }
  } catch {
    // ignore
  }
}

function onContentScroll(e: Event) {
  const el = e.target as HTMLElement
  if (el.scrollHeight - el.scrollTop - el.clientHeight < 200) {
    if (timeMachine.isActive.value) {
      loadMoreTimeMachine()
    }
  }
}

onMounted(async () => {
  if (!accountsStore.isLoaded) {
    await accountsStore.loadAccounts()
  }
  await loadServerIcons()

  const host = account.value?.host
  const accountId = currentAccountId.value

  // Detect policies and custom TLs
  if (host && accountId) {
    clearAvailableTlCache(accountId)
    const [ct, , availability] = await Promise.all([
      detectCustomTimelines(host),
      refreshFilterKeys(),
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

    if (!availableStandardTl.value.includes(currentTimeline.value)) {
      currentTimeline.value = 'home'
    }
  }

  await startTimeline(currentTimeline.value)
})

onUnmounted(() => {
  subscription?.dispose()
  if (flushTimer) {
    clearTimeout(flushTimer)
    flushTimer = null
  }
})
</script>

<template>
  <div :class="$style.pipRoot" :style="themeVars">
    <!-- Column-style header -->
    <header :class="$style.columnHeader" data-tauri-drag-region>
      <div
        :class="$style.colorIndicator"
        :style="{ background: 'var(--nd-accent)' }"
      />

      <!-- Current TL icon -->
      <span :class="$style.tlHeaderIconWrap" data-tauri-drag-region>
        <i v-if="isTablerIcon(currentTlIcon)" :class="['ti ti-' + currentTlIcon, $style.tlHeaderIcon]" />
        <svg v-else :class="$style.tlHeaderIcon" viewBox="0 0 24 24" width="14" height="14">
          <path :d="currentTlIcon" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" fill="none" />
        </svg>
      </span>

      <span :class="$style.headerTitle" data-tauri-drag-region>タイムライン</span>

      <!-- Account indicator -->
      <button
        :class="[$style.headerAccount, { [$style.clickable]: accountsStore.accounts.length > 1 }]"
        @click="toggleAccountMenu"
      >
        <img v-if="account?.avatarUrl" :src="account.avatarUrl" :class="$style.headerAvatar" />
        <img
          :class="$style.headerFavicon"
          :src="serverIconUrl || `https://${account?.host}/favicon.ico`"
          :title="account?.host"
        />
      </button>

      <!-- Close button -->
      <button :class="$style.headerBtn" title="閉じる" @click="closeWindow">
        <i class="ti ti-x" />
      </button>
    </header>

    <!-- TL tabs (matching DeckTimelineColumn) -->
    <nav ref="tabsRef" :class="$style.tlTabs">
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
          :class="[$style.tlTab, { [$style.active]: currentTimeline === opt.value }]"
          :title="opt.label"
          @click="switchTl(opt.value)"
        >
          <i v-if="isTablerIcon(getTlIcon(opt.value))" :class="['ti ti-' + getTlIcon(opt.value), $style.tlTabIcon]" />
          <svg v-else :class="$style.tlTabIcon" viewBox="0 0 24 24" width="16" height="16">
            <path :d="getTlIcon(opt.value)" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" fill="none" />
          </svg>
          <span v-if="currentTimeline === opt.value" :class="$style.tlTabLabel">{{ opt.label }}</span>
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
    </nav>

    <!-- Timeline body -->
    <div :class="$style.pipBody">
      <!-- Account switcher overlay -->
      <div v-if="showAccountMenu" :class="$style.pipAccountOverlay" @click.self="showAccountMenu = false">
        <div :class="$style.pipAccountMenu">
          <button
            v-for="acc in accountsStore.accounts"
            :key="acc.id"
            :class="[$style.pipAccountItem, { [$style.active]: acc.id === currentAccountId }]"
            @click="switchAccount(acc.id)"
          >
            <img v-if="acc.avatarUrl" :src="acc.avatarUrl" :class="$style.headerAvatar" />
            <img
              :class="$style.headerFavicon"
              :src="serverIcons.get(acc.host) || `https://${acc.host}/favicon.ico`"
            />
            <span :class="$style.pipAccountName">{{ acc.username }}</span>
            <span :class="$style.pipAccountHost">@{{ acc.host }}</span>
          </button>
        </div>
      </div>

      <div :class="$style.pipContent" @scroll="onContentScroll">
        <div v-if="error" :class="$style.pipError">{{ error }}</div>
        <div v-if="notes.length === 0 && timeMachine.isActive.value" :class="$style.pipEmpty">
          No cached notes for this date
        </div>
        <div
          v-for="note in notes"
          :key="note.id"
          :class="$style.pipNote"
          @click="onNoteClick(note)"
        >
          <MkAvatar
            :avatar-url="(note.renote && note.text === null ? note.renote.user : note.user).avatarUrl"
            :size="28"
            :class="$style.pipNoteAvatar"
          />
          <div :class="$style.pipNoteBody">
            <div :class="$style.pipNoteHeader">
              <span :class="$style.pipNoteName">
                <MkMfm
                  v-if="(note.renote && note.text === null ? note.renote.user : note.user).name"
                  :text="(note.renote && note.text === null ? note.renote.user : note.user).name!"
                  :emojis="(note.renote && note.text === null ? note.renote.user : note.user).emojis"
                  :account-id="currentAccountId"
                  :server-host="account?.host"
                />
                <template v-else>{{ (note.renote && note.text === null ? note.renote.user : note.user).username }}</template>
              </span>
              <span :class="$style.pipNoteTime">{{ formatTime(note.createdAt) }}</span>
            </div>
            <div :class="$style.pipNoteText">
              <MkMfm
                v-if="(note.renote && note.text === null ? note.renote.text : note.text)"
                :text="(note.renote && note.text === null ? note.renote.text : note.text)!"
                :emojis="(note.renote && note.text === null ? note.renote.emojis : note.emojis)"
                :account-id="currentAccountId"
                :server-host="account?.host"
              />
              <span v-else :class="$style.pipNoteEmpty">
                <i class="ti ti-repeat" /> Renote
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>

  <TimelineFilterPopup
    :show="showFilterMenu"
    :filter-keys="availableFilterKeys"
    :filters="filters"
    :position="filterPopupPos"
    :theme-vars="themeVars"
    @close="showFilterMenu = false"
    @toggle="toggleFilter"
  />
</template>

<style lang="scss" module>
.pipRoot {
  display: flex;
  flex-direction: column;
  height: 100dvh;
  background: var(--nd-bg);
  color: var(--nd-fg);
  overflow: hidden;
  border-radius: var(--nd-radius-md);
}

/* === Column header (unified with DeckColumn.vue) === */
.columnHeader {
  position: relative;
  display: flex;
  align-items: center;
  gap: 6px;
  height: 38px;
  line-height: 38px;
  padding: 0 8px 0 30px;
  background: var(--nd-panelHeaderBg);
  color: var(--nd-panelHeaderFg);
  font-size: 0.9em;
  font-weight: bold;
  flex-shrink: 0;
  user-select: none;
  box-shadow: 0 0.5px 0 0 rgba(255, 255, 255, 0.07);
}

.colorIndicator {
  position: absolute;
  top: 12px;
  left: 12px;
  width: 5px;
  height: calc(100% - 24px);
  border-radius: var(--nd-radius-full);
}

.tlHeaderIconWrap {
  display: inline-flex;
  align-items: center;
}

.tlHeaderIcon {
  flex-shrink: 0;
  opacity: 0.7;
}

.headerTitle {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 0.85em;
}

.headerAccount {
  display: flex;
  align-items: center;
  gap: 4px;
  flex-shrink: 0;
  border: none;
  background: none;
  padding: 2px;
  border-radius: 4px;
  cursor: default;

  &.clickable {
    cursor: pointer;

    &:hover {
      background: rgba(255, 255, 255, 0.1);
    }
  }
}

.headerAvatar {
  width: 18px;
  height: 18px;
  max-width: 18px;
  max-height: 18px;
  flex-shrink: 0;
  border-radius: 50%;
  object-fit: cover;
}

.headerFavicon {
  width: 16px;
  height: 16px;
  max-width: 16px;
  max-height: 16px;
  flex-shrink: 0;
  object-fit: contain;
  opacity: 0.7;
}

.headerBtn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border: none;
  background: none;
  color: var(--nd-panelHeaderFg);
  border-radius: var(--nd-radius-sm);
  flex-shrink: 0;
  opacity: 0.35;
  cursor: pointer;

  &:hover {
    background: var(--nd-buttonHoverBg);
    opacity: 0.8;
  }
}

/* === TL tabs (unified with DeckTimelineColumn) === */
.tlTabs {
  display: flex;
  position: relative;
  border-bottom: 1px solid var(--nd-divider);
  background: var(--nd-bg);
  flex-shrink: 0;
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

.tlTmDate {
  font-weight: bold;
  cursor: default;
}

.tlTmLive {
  margin-left: auto;
  color: var(--nd-accent);
}

/* === Body (relative for overlay) === */
.pipBody {
  position: relative;
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

/* Account switcher overlay */
.pipAccountOverlay {
  position: absolute;
  inset: 0;
  z-index: 10;
  background: rgba(0, 0, 0, 0.3);
}

.pipAccountMenu {
  background: var(--nd-panel);
  border-bottom: 1px solid var(--nd-divider);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
}

.pipAccountItem {
  display: flex;
  align-items: center;
  gap: 4px;
  width: 100%;
  padding: 6px 8px;
  border: none;
  background: none;
  color: var(--nd-fg);
  font-size: 0.75em;
  cursor: pointer;
  transition: background var(--nd-duration-fast);

  &:hover {
    background: var(--nd-buttonHoverBg);
  }

  &.active {
    background: rgba(255, 255, 255, 0.05);
  }
}

.pipAccountName {
  font-weight: 600;
}

.pipAccountHost {
  opacity: 0.5;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* === Timeline content === */
.pipContent {
  flex: 1;
  overflow-y: auto;
  scrollbar-width: thin;
  scrollbar-color: var(--nd-scrollbarHandle) transparent;
}

.pipError {
  padding: 16px;
  text-align: center;
  font-size: 0.8em;
  color: var(--nd-love);
}

.pipEmpty {
  padding: 16px;
  text-align: center;
  font-size: 0.8em;
  opacity: 0.5;
}

.pipNote {
  display: flex;
  gap: 8px;
  padding: 6px 8px;
  border-bottom: 1px solid var(--nd-divider);
  cursor: pointer;
  transition: background var(--nd-duration-fast);

  &:hover {
    background: var(--nd-buttonHoverBg);
  }
}

.pipNoteAvatar {
  width: 28px;
  height: 28px;
  flex-shrink: 0;
}

.pipNoteBody {
  flex: 1;
  min-width: 0;
  overflow: hidden;
}

.pipNoteHeader {
  display: flex;
  align-items: baseline;
  gap: 4px;
  margin-bottom: 1px;
}

.pipNoteName {
  font-size: 0.75em;
  font-weight: 600;
  color: var(--nd-fgHighlighted);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.pipNoteTime {
  font-size: 0.65em;
  opacity: 0.4;
  flex-shrink: 0;
  margin-left: auto;
}

.pipNoteText {
  font-size: 0.8em;
  line-height: 1.4;
  overflow: hidden;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
}

.pipNoteEmpty {
  opacity: 0.4;
  font-size: 0.85em;
}

// Keep for dynamic binding
.clickable {}
.active {}
</style>
