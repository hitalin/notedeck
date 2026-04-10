<script setup lang="ts">
import { json } from '@codemirror/lang-json'
import {
  computed,
  defineAsyncComponent,
  onMounted,
  onUnmounted,
  ref,
  shallowRef,
  watch,
} from 'vue'
import type { RawStreamEvent } from '@/adapters/types'
import { useColumnTheme } from '@/composables/useColumnTheme'
import { useMultiAccountAdapters } from '@/composables/useMultiAccountAdapters'
import { useAccountsStore } from '@/stores/accounts'
import type { DeckColumn as DeckColumnType } from '@/stores/deck'
import DeckColumn from './DeckColumn.vue'

const CodeEditor = defineAsyncComponent(
  () => import('./widgets/CodeEditor.vue'),
)

const props = defineProps<{
  column: DeckColumnType
}>()

const { columnThemeVars } = useColumnTheme(() => props.column)
const accountsStore = useAccountsStore()
const multiAdapters = useMultiAccountAdapters()
const jsonLang = json()

// --- Buffer ---

interface StreamEventEntry {
  id: number
  ts: number
  kind: string
  accountLabel: string
  payload: Record<string, unknown>
}

const MAX_BUFFER = 500
let nextId = 0
const buffer = shallowRef<StreamEventEntry[]>([])
const paused = ref(false)
const selectedId = ref<number | null>(null)

const selectedEntry = computed(() => {
  if (selectedId.value == null) return null
  return buffer.value.find((e) => e.id === selectedId.value) ?? null
})

const selectedJson = computed(() => {
  if (!selectedEntry.value) return ''
  return JSON.stringify(
    { kind: selectedEntry.value.kind, payload: selectedEntry.value.payload },
    null,
    2,
  )
})

// --- Filters ---

const ALL_KINDS = [
  'stream-note',
  'stream-notification',
  'stream-main-event',
  'stream-note-updated',
  'stream-mention',
  'stream-chat-message',
] as const

const KIND_LABELS: Record<string, string> = {
  'stream-note': 'note',
  'stream-notification': 'notif',
  'stream-main-event': 'main',
  'stream-note-updated': 'updated',
  'stream-mention': 'mention',
  'stream-chat-message': 'chat',
}

const enabledKinds = ref(new Set<string>(ALL_KINDS))

function toggleKind(kind: string) {
  const s = new Set(enabledKinds.value)
  if (s.has(kind)) s.delete(kind)
  else s.add(kind)
  enabledKinds.value = s
}

// --- Stream subscription ---

type CleanupFn = () => void
const cleanups: CleanupFn[] = []

function makeRawHandler(label: string) {
  return (event: RawStreamEvent) => {
    if (paused.value) return
    if (!enabledKinds.value.has(event.kind)) return
    const entry: StreamEventEntry = {
      id: nextId++,
      ts: Date.now(),
      kind: event.kind,
      accountLabel: label,
      payload: event.payload,
    }
    const arr = [entry, ...buffer.value]
    if (arr.length > MAX_BUFFER) arr.length = MAX_BUFFER
    buffer.value = arr
  }
}

async function subscribeAll() {
  // Clean up previous subscriptions
  for (const fn of cleanups) fn()
  cleanups.length = 0

  const accounts = accountsStore.accounts.filter((a) => a.hasToken)
  for (const acc of accounts) {
    const adapter = await multiAdapters.getOrCreate(acc.id)
    if (!adapter) continue
    // Don't call connect() — the stream is already connected by other columns.
    // Calling connect() would disrupt the existing listener generation.
    const label = `@${acc.username ?? '?'}@${acc.host}`
    const handler = makeRawHandler(label)
    adapter.stream.onRawEvent(handler)
    cleanups.push(() => adapter.stream.offRawEvent(handler))
  }
}

onMounted(() => {
  subscribeAll()
})

// Re-subscribe when accounts change
watch(
  () => accountsStore.accounts.length,
  () => {
    subscribeAll()
  },
)

onUnmounted(() => {
  for (const fn of cleanups) fn()
  cleanups.length = 0
})

// --- Actions ---

function selectRow(entry: StreamEventEntry) {
  selectedId.value = entry.id
}

function clearBuffer() {
  buffer.value = []
  selectedId.value = null
}

// --- Display helpers ---

function formatTime(ts: number): string {
  const d = new Date(ts)
  return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}:${d.getSeconds().toString().padStart(2, '0')}.${d.getMilliseconds().toString().padStart(3, '0')}`
}

function kindLabel(kind: string): string {
  return KIND_LABELS[kind] ?? kind.replace('stream-', '')
}

function summarize(entry: StreamEventEntry): string {
  const p = entry.payload
  if (p.note && typeof p.note === 'object') {
    const note = p.note as Record<string, unknown>
    const user = note.user as Record<string, unknown> | undefined
    const name = user?.username ?? '?'
    const text = typeof note.text === 'string' ? note.text.slice(0, 40) : ''
    return `@${name}: ${text}`
  }
  if (p.notification && typeof p.notification === 'object') {
    const n = p.notification as Record<string, unknown>
    return `${n.type ?? 'notification'}`
  }
  if (p.eventType) return String(p.eventType)
  if (p.message && typeof p.message === 'object') return 'chat message'
  return ''
}

// --- Detail pane resize ---

const wrapperRef = ref<HTMLElement | null>(null)
const detailHeight = ref(200)
let resizing = false

function onDividerPointerDown(e: PointerEvent) {
  e.preventDefault()
  resizing = true
  document.body.style.userSelect = 'none'
  document.body.style.cursor = 'row-resize'
  document.addEventListener('pointermove', onResizeMove)
  document.addEventListener('pointerup', onResizeUp)
}

function onResizeMove(e: PointerEvent) {
  if (!resizing || !wrapperRef.value) return
  const rect = wrapperRef.value.getBoundingClientRect()
  const newHeight = rect.bottom - e.clientY
  detailHeight.value = Math.max(60, Math.min(newHeight, rect.height - 80))
}

function onResizeUp() {
  resizing = false
  document.body.style.userSelect = ''
  document.body.style.cursor = ''
  document.removeEventListener('pointermove', onResizeMove)
  document.removeEventListener('pointerup', onResizeUp)
}

function scrollToTop() {
  // No-op for now; list is auto-scrolled
}
</script>

<template>
  <DeckColumn
    :column-id="column.id"
    :title="column.name ?? 'ストリーム'"
    :theme-vars="columnThemeVars"
    @header-click="scrollToTop"
  >
    <template #header-icon>
      <i class="ti ti-activity-heartbeat" :class="$style.headerIcon" />
    </template>

    <template #header-meta>
      <button
        class="_button"
        :class="[$style.headerBtn, paused && $style.headerBtnActive]"
        :title="paused ? '再開' : '一時停止'"
        @click.stop="paused = !paused"
      >
        <i :class="paused ? 'ti ti-player-play' : 'ti ti-player-pause'" />
      </button>
      <button
        class="_button"
        :class="$style.headerBtn"
        title="クリア"
        @click.stop="clearBuffer"
      >
        <i class="ti ti-trash" />
      </button>
    </template>

    <div ref="wrapperRef" :class="$style.wrapper">
      <!-- Filter pills -->
      <div :class="$style.filters">
        <button
          v-for="kind in ALL_KINDS"
          :key="kind"
          class="_button"
          :class="[$style.pill, enabledKinds.has(kind) && $style.pillActive]"
          @click="toggleKind(kind)"
        >
          {{ KIND_LABELS[kind] ?? kind }}
        </button>
      </div>

      <!-- Event list -->
      <div :class="$style.list">
        <div
          v-for="entry in buffer"
          :key="entry.id"
          :class="[$style.row, selectedId === entry.id && $style.rowSelected]"
          @click="selectRow(entry)"
        >
          <span :class="$style.rowTime">{{ formatTime(entry.ts) }}</span>
          <span :class="$style.rowKind">{{ kindLabel(entry.kind) }}</span>
          <span :class="$style.rowAccount">{{ entry.accountLabel }}</span>
          <span :class="$style.rowSummary">{{ summarize(entry) }}</span>
        </div>
        <div v-if="buffer.length === 0" :class="$style.empty">
          イベント待機中...
        </div>
      </div>

      <!-- Resize handle + Detail pane -->
      <div v-if="selectedEntry" :class="$style.divider" @pointerdown="onDividerPointerDown" />
      <div v-if="selectedEntry" :class="$style.detail" :style="{ height: detailHeight + 'px' }">
        <div :class="$style.detailHeader">
          <span :class="$style.detailTitle">{{ kindLabel(selectedEntry.kind) }}</span>
          <span :class="$style.detailTime">{{ formatTime(selectedEntry.ts) }}</span>
        </div>
        <CodeEditor
          :model-value="selectedJson"
          :language="jsonLang"
          :read-only="true"
          :auto-height="true"
          :class="$style.editor"
        />
      </div>
    </div>
  </DeckColumn>
</template>

<style module lang="scss">
.headerIcon {
  font-size: 1em;
}

.headerBtn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border-radius: var(--nd-radius-sm);
  color: var(--nd-fg);
  opacity: 0.6;
  transition:
    background var(--nd-duration-fast),
    opacity var(--nd-duration-fast);

  &:hover {
    background: var(--nd-buttonHoverBg);
    opacity: 1;
  }
}

.headerBtnActive {
  color: var(--nd-accent);
  opacity: 1;
}

.wrapper {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
}

.filters {
  display: flex;
  gap: 4px;
  padding: 6px 8px;
  border-bottom: 1px solid var(--nd-divider);
  flex-wrap: wrap;
  flex-shrink: 0;
}

.pill {
  padding: 2px 8px;
  font-size: 0.7em;
  border-radius: 10px;
  border: 1px solid var(--nd-divider);
  color: var(--nd-fg);
  opacity: 0.5;
  transition:
    opacity var(--nd-duration-fast),
    border-color var(--nd-duration-fast);

  &:hover {
    opacity: 0.8;
  }
}

.pillActive {
  opacity: 1;
  border-color: var(--nd-accent);
  color: var(--nd-accent);
}

.list {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
}

.row {
  display: flex;
  gap: 8px;
  padding: 3px 8px;
  font-size: 0.72em;
  font-family: 'Fira Code', 'Cascadia Code', 'Consolas', monospace;
  cursor: pointer;
  border-bottom: 1px solid transparent;
  transition: background var(--nd-duration-fast);

  &:hover {
    background: var(--nd-buttonHoverBg);
  }
}

.rowSelected {
  background: rgba(var(--nd-accentRgb, 100, 150, 255), 0.15);
  border-bottom-color: var(--nd-divider);
}

.rowTime {
  color: var(--nd-fg);
  opacity: 0.5;
  flex-shrink: 0;
}

.rowKind {
  color: var(--nd-accent);
  min-width: 56px;
  flex-shrink: 0;
}

.rowAccount {
  color: var(--nd-fg);
  opacity: 0.4;
  font-size: 0.9em;
  flex-shrink: 0;
  max-width: 120px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.rowSummary {
  color: var(--nd-fg);
  opacity: 0.7;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  min-width: 0;
}

.empty {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 32px;
  color: var(--nd-fg);
  opacity: 0.4;
  font-size: 0.85em;
}

.divider {
  height: 5px;
  flex-shrink: 0;
  cursor: row-resize;
  background: var(--nd-divider);
  transition: background var(--nd-duration-fast);

  &:hover,
  &:active {
    background: var(--nd-accent);
  }
}

.detail {
  flex-shrink: 0;
  overflow: auto;
}

.detailHeader {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 8px;
  font-size: 0.75em;
  border-bottom: 1px solid var(--nd-divider);
}

.detailTitle {
  font-weight: bold;
  color: var(--nd-accent);
}

.detailTime {
  color: var(--nd-fg);
  opacity: 0.5;
  margin-left: auto;
}

.editor {
  height: auto;
}
</style>
