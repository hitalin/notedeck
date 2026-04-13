<script setup lang="ts">
import { computed, onUnmounted, ref } from 'vue'
import ColumnEmptyState from '@/components/common/ColumnEmptyState.vue'
import RawJsonView from '@/components/common/RawJsonView.vue'
import { useColumnTheme } from '@/composables/useColumnTheme'
import { useSensitiveMask } from '@/composables/useSensitiveMask'
import { useServerImages } from '@/composables/useServerImages'
import { useVerticalResize } from '@/composables/useVerticalResize'
import type { DeckColumn as DeckColumnType } from '@/stores/deck'
import { useTaskRunnerStore } from '@/stores/taskRunner'
import { useTasksStore } from '@/stores/tasks'
import { useWindowsStore } from '@/stores/windows'
import DeckColumn from './DeckColumn.vue'

const props = defineProps<{
  column: DeckColumnType
}>()

const { columnThemeVars } = useColumnTheme(() => props.column)
const { serverInfoImageUrl } = useServerImages(() => props.column)
const tasksStore = useTasksStore()
const runnerStore = useTaskRunnerStore()
const windowsStore = useWindowsStore()

const SENSITIVE_RAW_KEYS = new Set<string>([
  'i',
  'token',
  'password',
  'apiKey',
  'secret',
])
const { showSensitive, formatJson } = useSensitiveMask(SENSITIVE_RAW_KEYS)

const query = ref('')
const selectedId = ref<number | null>(null)

const now = ref(Date.now())
const tickTimer = setInterval(() => {
  now.value = Date.now()
}, 15_000)
onUnmounted(() => clearInterval(tickTimer))

const filteredDefinitions = computed(() => {
  const q = query.value.trim().toLowerCase()
  if (!q) return tasksStore.definitions
  return tasksStore.definitions.filter(
    (d) =>
      d.id.includes(q) ||
      d.label.toLowerCase().includes(q) ||
      (d.description?.toLowerCase().includes(q) ?? false),
  )
})

const selectedRun = computed(() =>
  selectedId.value == null
    ? null
    : (runnerStore.runs.find((r) => r.id === selectedId.value) ?? null),
)

const runningCount = computed(
  () => runnerStore.runs.filter((r) => r.status === 'running').length,
)

const previewJson = computed(() => {
  const r = selectedRun.value
  if (!r) return ''
  return formatJson({
    method: r.method,
    accountId: r.accountId,
    params: r.params,
    ...(r.status === 'ok' ? { response: r.response } : {}),
    ...(r.status === 'error' ? { error: r.error } : {}),
  })
})

function statusIcon(status: string): string {
  if (status === 'running') return 'ti-loader-2 nd-spin'
  if (status === 'ok') return 'ti-check'
  return 'ti-alert-triangle'
}

function formatElapsed(ms: number): string {
  if (ms < 1000) return `${ms}ms`
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`
  return `${Math.floor(ms / 60_000)}m${Math.floor((ms % 60_000) / 1000)}s`
}

function formatAgo(ts: number): string {
  const diff = Math.max(0, now.value - ts)
  if (diff < 60_000) return 'さっき'
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}分前`
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}時間前`
  return `${Math.floor(diff / 86_400_000)}日前`
}

function runDuration(run: { startedAt: number; finishedAt?: number }): string {
  const end = run.finishedAt ?? now.value
  return formatElapsed(end - run.startedAt)
}

function runFromList(taskId: string) {
  void runnerStore.runTask(taskId)
}

function clearHistory() {
  runnerStore.clear()
  selectedId.value = null
}

function openEditor() {
  windowsStore.open('tasksEditor')
}

const wrapperRef = ref<HTMLElement | null>(null)
const { value: detailHeight, start: onDividerPointerDown } = useVerticalResize({
  containerRef: wrapperRef,
  mode: 'bottom-px',
  initial: 320,
  min: 80,
  topMargin: 120,
})
</script>

<template>
  <DeckColumn
    :column-id="column.id"
    title="タスク"
    :theme-vars="columnThemeVars"
  >
    <template #header-icon>
      <i class="ti ti-list-check" :class="$style.headerIcon" />
    </template>

    <template #header-meta>
      <button
        v-if="runnerStore.runs.length > 0"
        class="_button"
        :class="$style.headerBtn"
        title="履歴をクリア"
        @click.stop="clearHistory()"
      >
        <i class="ti ti-trash" />
      </button>
      <button
        class="_button"
        :class="$style.headerBtn"
        title="tasks.json5 を編集"
        @click.stop="openEditor()"
      >
        <i class="ti ti-pencil" />
      </button>
    </template>

    <div ref="wrapperRef" :class="$style.wrapper">
      <div :class="$style.toolbar">
        <div :class="$style.searchWrap">
          <i class="ti ti-search" :class="$style.searchIcon" />
          <input
            v-model="query"
            type="text"
            :class="$style.search"
            placeholder="タスクを検索"
          />
          <button
            v-if="query"
            class="_button"
            :class="$style.searchClear"
            @click="query = ''"
          >
            <i class="ti ti-x" />
          </button>
        </div>
      </div>

      <div :class="$style.scroll">
        <ColumnEmptyState
          v-if="tasksStore.definitions.length === 0"
          message="tasks.json5 を編集してタスクを定義すると、ここから 1-click で実行できます。"
          :image-url="serverInfoImageUrl"
          cta-label="tasks.json5 を編集"
          cta-icon="ti-pencil"
          @cta="openEditor()"
        />
        <ColumnEmptyState
          v-else-if="filteredDefinitions.length === 0"
          :message="`&quot;${query}&quot; に一致するタスクはありません`"
        />
        <template v-else>
          <section :class="$style.section">
            <div :class="$style.sectionHeader">
              <span :class="$style.sectionTitle">
                タスク
                <span :class="$style.countSub">{{ filteredDefinitions.length }}</span>
              </span>
              <span
                v-if="tasksStore.lastError"
                :class="$style.errorBadge"
                :title="tasksStore.lastError"
              >
                <i class="ti ti-alert-triangle" /> エラー
              </span>
            </div>
            <button
              v-for="def in filteredDefinitions"
              :key="def.id"
              class="_button"
              :class="$style.runBtn"
              :title="def.description || def.label"
              @click="runFromList(def.id)"
            >
              <i class="ti ti-player-play" :class="$style.runIcon" />
              <div :class="$style.runBody">
                <span :class="$style.runLabel">{{ def.label }}</span>
                <span v-if="def.description" :class="$style.runDesc">{{ def.description }}</span>
              </div>
              <span v-if="def.inputs?.length" :class="$style.runBadge" title="入力を求める">
                <i class="ti ti-keyboard" />{{ def.inputs.length }}
              </span>
            </button>
          </section>

          <section :class="$style.section">
            <div :class="$style.sectionHeader">
              <span :class="$style.sectionTitle">
                履歴
                <span :class="$style.countSub">{{ runnerStore.runs.length }}</span>
                <span v-if="runningCount > 0" :class="$style.runningPill">
                  <i class="ti ti-loader-2 nd-spin" />{{ runningCount }} 実行中
                </span>
              </span>
            </div>
            <div v-if="runnerStore.runs.length === 0" :class="$style.emptyHint">
              実行履歴はまだありません
            </div>
            <button
              v-for="run in runnerStore.runs"
              :key="run.id"
              class="_button"
              :class="[$style.runItem, {
                [$style.selected]: run.id === selectedId,
                [$style.statusOk]: run.status === 'ok',
                [$style.statusError]: run.status === 'error',
                [$style.statusRunning]: run.status === 'running',
              }]"
              @click="selectedId = run.id === selectedId ? null : run.id"
            >
              <i :class="['ti', statusIcon(run.status), $style.runItemIcon]" />
              <div :class="$style.runItemBody">
                <span :class="$style.runItemLabel">{{ run.label }}</span>
                <span :class="$style.runItemMeta">
                  <code :class="$style.method">{{ run.method }}</code>
                  <span>{{ runDuration(run) }}</span>
                </span>
              </div>
              <span :class="$style.runItemTime">{{ formatAgo(run.startedAt) }}</span>
            </button>
          </section>
        </template>
      </div>

      <div
        v-if="selectedRun"
        :class="$style.divider"
        @pointerdown="onDividerPointerDown"
      />
      <div
        v-if="selectedRun"
        :class="$style.detail"
        :style="{ height: detailHeight + 'px' }"
      >
        <RawJsonView
          :json="previewJson"
          :can-reveal="true"
          v-model:show-sensitive="showSensitive"
        >
          <template #hint>
            <code :class="$style.method">{{ selectedRun.method }}</code>
            <span :class="[$style.statusTag, {
              [$style.statusOk]: selectedRun.status === 'ok',
              [$style.statusError]: selectedRun.status === 'error',
              [$style.statusRunning]: selectedRun.status === 'running',
            }]">{{ selectedRun.status }}</span>
            <span>{{ runDuration(selectedRun) }}</span>
          </template>
        </RawJsonView>
      </div>
    </div>
  </DeckColumn>
</template>

<style lang="scss" module>
@use './column-common.module.scss';

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

.wrapper {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
}

.toolbar {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 8px;
  border-bottom: 1px solid var(--nd-divider);
  flex-shrink: 0;
}

.searchWrap {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 8px;
  border: 1px solid var(--nd-divider);
  border-radius: 999px;
  background: var(--nd-bg);
  transition: border-color var(--nd-duration-base);

  &:focus-within { border-color: var(--nd-accent); }
}

.searchIcon { opacity: 0.45; flex-shrink: 0; }

.search {
  flex: 1;
  min-width: 0;
  background: transparent;
  border: none;
  outline: none;
  color: var(--nd-fg);
  font-size: 0.85em;
}

.searchClear {
  opacity: 0.5;
  &:hover { opacity: 1; }
}

.scroll {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
}

.section { flex-shrink: 0; }

.sectionHeader {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 14px 6px;
  font-size: 0.75em;
  font-weight: bold;
  color: var(--nd-fg);
  text-transform: uppercase;
  letter-spacing: 0.04em;
  opacity: 0.6;
}

.sectionTitle {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 6px;
}

.countSub {
  font-weight: normal;
  opacity: 0.7;
  margin-left: 4px;
}

.runningPill {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  padding: 1px 6px;
  font-size: 0.75em;
  font-weight: normal;
  border-radius: 999px;
  background: color-mix(in srgb, var(--nd-accent) 18%, transparent);
  color: var(--nd-accent);
  text-transform: none;
  letter-spacing: 0;
}

.errorBadge {
  color: var(--nd-love, #c66);
  text-transform: none;
  letter-spacing: 0;
  font-weight: normal;
  opacity: 1;
}

.emptyHint {
  padding: 10px 14px 14px;
  color: var(--nd-fg);
  opacity: 0.55;
  font-size: 0.8em;
  text-align: center;
}

.runBtn {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 10px 14px;
  font-size: 0.9em;
  text-align: left;
  color: var(--nd-fgHighlighted);
  transition: background var(--nd-duration-base);

  &:hover { background: var(--nd-buttonHoverBg); }
  & + & { border-top: 1px solid color-mix(in srgb, var(--nd-divider) 40%, transparent); }
}

.runIcon {
  flex-shrink: 0;
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  background: color-mix(in srgb, var(--nd-accent) 15%, transparent);
  color: var(--nd-accent);
  font-size: 14px;
}

.runBody {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.runLabel {
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.runDesc {
  opacity: 0.55;
  font-size: 0.8em;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.runBadge {
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  gap: 2px;
  padding: 1px 6px;
  font-size: 0.7em;
  border-radius: 999px;
  background: var(--nd-buttonBg);
  color: var(--nd-fg);
  opacity: 0.65;
}

.runItem {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 8px 14px;
  font-size: 0.85em;
  text-align: left;
  color: var(--nd-fg);
  transition: background var(--nd-duration-base);

  &:hover { background: var(--nd-buttonHoverBg); }
  &.selected { background: var(--nd-accent-subtle, var(--nd-buttonHoverBg)); }
  & + & { border-top: 1px solid color-mix(in srgb, var(--nd-divider) 40%, transparent); }
}

.runItemIcon { flex-shrink: 0; }
.statusRunning .runItemIcon { color: var(--nd-accent); }
.statusOk .runItemIcon { color: var(--nd-mfmSuccess, #4a8); }
.statusError .runItemIcon { color: var(--nd-love, #c66); }

.runItemBody {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.runItemLabel {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.runItemMeta {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 0.85em;
  opacity: 0.55;
  font-variant-numeric: tabular-nums;
}

.method {
  font-family: var(--nd-font-mono, monospace);
  font-size: 0.95em;
}

.runItemTime {
  flex-shrink: 0;
  opacity: 0.55;
  font-size: 0.8em;
}

.statusTag {
  padding: 1px 6px;
  border-radius: 999px;
  font-size: 0.85em;

  &.statusRunning { background: color-mix(in srgb, var(--nd-accent) 18%, transparent); color: var(--nd-accent); }
  &.statusOk { background: color-mix(in srgb, var(--nd-mfmSuccess, #4a8) 18%, transparent); color: var(--nd-mfmSuccess, #4a8); }
  &.statusError { background: color-mix(in srgb, var(--nd-love, #c66) 18%, transparent); color: var(--nd-love, #c66); }
}

.selected { /* modifier */ }

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
  display: flex;
  flex-direction: column;
}
</style>
