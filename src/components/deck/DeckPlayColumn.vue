<script setup lang="ts">
import { type Ast, type Interpreter } from '@syuilo/aiscript'
import { invoke } from '@tauri-apps/api/core'
import { computed, ref } from 'vue'
import { createAiScriptEnv } from '@/aiscript/api'
import {
  createAiScriptInterpreter,
  createInterpreterOptions,
  execAiScript,
  parseAiScript,
} from '@/aiscript/common'
import { sanitizeCode } from '@/aiscript/sanitize'
import { createAiScriptUiLib, type UiComponent } from '@/aiscript/ui'
import { useAccountsStore } from '@/stores/accounts'
import type { DeckColumn as DeckColumnType } from '@/stores/deck'
import { useThemeStore } from '@/stores/theme'
import { AppError } from '@/utils/errors'
import DeckColumn from './DeckColumn.vue'
import AiScriptUiRenderer from './widgets/AiScriptUiRenderer.vue'

const props = defineProps<{
  column: DeckColumnType
}>()

const accountsStore = useAccountsStore()
const themeStore = useThemeStore()
const account = computed(() =>
  accountsStore.accounts.find((a) => a.id === props.column.accountId),
)
const serverUrl = computed(() =>
  account.value ? `https://${account.value.host}` : '',
)
const columnThemeVars = computed(() => {
  const accountId = props.column.accountId
  if (!accountId) return undefined
  return themeStore.getStyleVarsForAccount(accountId)
})

// --- Mode ---
type Mode = 'list' | 'ready' | 'started'
const mode = ref<Mode>('list')

// --- List mode ---
type Tab = 'featured' | 'my' | 'likes'
const activeTab = ref<Tab>('featured')

interface FlashSummary {
  id: string
  title: string
  summary: string
  userId: string
  user: {
    username: string
    host: string | null
    name: string | null
    avatarUrl: string | null
  }
  likedCount: number
  isLiked?: boolean
  createdAt: string
}

const listItems = ref<FlashSummary[]>([])
const listLoading = ref(false)
const listError = ref<string | null>(null)

async function fetchList(tab?: Tab) {
  if (!props.column.accountId) return
  const t = tab ?? activeTab.value
  activeTab.value = t
  listLoading.value = true
  listError.value = null
  listItems.value = []

  const endpointMap: Record<Tab, string> = {
    featured: 'flash/featured',
    my: 'flash/my',
    likes: 'flash/my-likes',
  }

  try {
    const raw = await invoke<
      FlashSummary[] | { id: string; flash: FlashSummary }[]
    >('api_request', {
      accountId: props.column.accountId,
      endpoint: endpointMap[t],
      params: { limit: 30 },
    })
    // flash/my-likes returns { id, flash } wrapper objects
    listItems.value =
      t === 'likes'
        ? (raw as { id: string; flash: FlashSummary }[]).map(
            (item) => item.flash,
          )
        : (raw as FlashSummary[])
  } catch (e) {
    listError.value = AppError.from(e).message
  } finally {
    listLoading.value = false
  }
}

// Initial load
fetchList()

// --- Flash detail ---
interface FlashDetail {
  id: string
  title: string
  summary: string
  script: string
  userId: string
  user: {
    username: string
    host: string | null
    name: string | null
    avatarUrl: string | null
  }
  likedCount: number
  isLiked: boolean
  createdAt: string
  updatedAt: string
}

const flash = ref<FlashDetail | null>(null)
const fetchError = ref<string | null>(null)
const fetching = ref(false)

const uiComponents = ref<UiComponent[]>([])
const consoleOutput = ref<{ text: string; isError: boolean }[]>([])
const runError = ref<string | null>(null)
const running = ref(false)
const interpreter = ref<Interpreter | null>(null)

// --- Open Play (show ready screen) ---
async function openPlay(flashId: string) {
  if (!props.column.accountId) return
  mode.value = 'ready'
  flash.value = null
  fetchError.value = null
  fetching.value = true
  resetRunState()

  try {
    flash.value = await invoke<FlashDetail>('api_request', {
      accountId: props.column.accountId,
      endpoint: 'flash/show',
      params: { flashId },
    })
  } catch (e) {
    fetchError.value = AppError.from(e).message
  } finally {
    fetching.value = false
  }
}

// --- Start Play ---
function startPlay() {
  if (!flash.value) return
  mode.value = 'started'
  resetRunState()
  running.value = true
  executePlay(flash.value)
}

function resetRunState() {
  runError.value = null
  uiComponents.value = []
  consoleOutput.value = []
  running.value = false
  if (interpreter.value) {
    interpreter.value.abort()
    interpreter.value = null
  }
}

async function executePlay(detail: FlashDetail) {
  const apiOption = async (
    endpoint: string,
    params: Record<string, unknown>,
  ) => {
    return invoke('api_request', {
      accountId: props.column.accountId,
      endpoint,
      params,
    })
  }

  const code = sanitizeCode(detail.script)

  let ast: Ast.Node[]
  let legacy: boolean
  try {
    const result = parseAiScript(code)
    ast = result.ast
    legacy = result.legacy
  } catch (e) {
    runError.value = AppError.from(e).message
    running.value = false
    return
  }

  const env = createAiScriptEnv(
    { api: apiOption, storagePrefix: `play-${detail.id}` },
    {
      THIS_ID: detail.id,
      THIS_URL: `${serverUrl.value}/play/${detail.id}`,
      USER_ID: props.column.accountId ?? '',
      USER_NAME: account.value?.displayName ?? '',
      USER_USERNAME: account.value?.username ?? '',
      LOCALE: navigator.language,
      SERVER_URL: serverUrl.value,
    },
  )

  const ui = createAiScriptUiLib({
    onRender: (components) => {
      uiComponents.value = components
    },
  })

  const ioOpts = createInterpreterOptions({
    onOutput: (text) => consoleOutput.value.push({ text, isError: false }),
    onError: (err) => {
      runError.value = err.message
    },
  })

  const interp = createAiScriptInterpreter({ ...env, ...ui }, ioOpts, legacy)
  interpreter.value = interp
  try {
    await execAiScript(interp, ast, legacy)
  } catch (e) {
    runError.value = AppError.from(e).message
  }
  running.value = false
}

async function toggleLike() {
  if (!flash.value || !props.column.accountId) return
  const endpoint = flash.value.isLiked ? 'flash/unlike' : 'flash/like'
  try {
    await invoke('api_request', {
      accountId: props.column.accountId,
      endpoint,
      params: { flashId: flash.value.id },
    })
    flash.value.isLiked = !flash.value.isLiked
    flash.value.likedCount += flash.value.isLiked ? 1 : -1
  } catch {
    // ignore
  }
}

function goBack() {
  if (mode.value === 'started') {
    // Started → Ready (reset like Misskey's reload)
    resetRunState()
    mode.value = 'ready'
    return
  }
  // Ready → List
  mode.value = 'list'
  flash.value = null
  fetchError.value = null
  resetRunState()
  fetchList()
}

function reload() {
  // Reset and go back to ready screen
  resetRunState()
  mode.value = 'ready'
}
</script>

<template>
  <DeckColumn :column-id="column.id" :title="column.name ?? 'Play'" :theme-vars="columnThemeVars">
    <template #header-icon>
      <i class="ti ti-player-play tl-header-icon" />
    </template>

    <template #header-meta>
      <button v-if="mode !== 'list'" class="_button header-refresh" title="Back" @click.stop="goBack">
        <i class="ti ti-arrow-left" />
      </button>
      <button v-else class="_button header-refresh" title="Refresh" :disabled="listLoading" @click.stop="fetchList()">
        <i class="ti ti-refresh" :class="{ spin: listLoading }" />
      </button>
      <div v-if="account" class="header-account">
        <img v-if="account.avatarUrl" :src="account.avatarUrl" class="header-avatar" />
      </div>
    </template>

    <!-- List mode -->
    <template v-if="mode === 'list'">
      <div class="play-tabs">
        <button
          v-for="tab in (['featured', 'my', 'likes'] as Tab[])"
          :key="tab"
          class="_button play-tab"
          :class="{ active: activeTab === tab }"
          @click="fetchList(tab)"
        >
          {{ tab === 'featured' ? '人気' : tab === 'my' ? '自分の' : 'いいね' }}
        </button>
      </div>

      <div class="play-list">
        <div v-if="listLoading" class="column-empty">読み込み中...</div>
        <div v-else-if="listError" class="column-empty column-error">{{ listError }}</div>
        <div v-else-if="listItems.length === 0" class="column-empty">Playが見つかりません</div>
        <button
          v-for="item in listItems"
          :key="item.id"
          class="_button play-card"
          @click="openPlay(item.id)"
        >
          <div class="play-card-title">{{ item.title }}</div>
          <div class="play-card-meta">
            <span class="play-card-author">@{{ item.user.username }}</span>
            <span v-if="item.likedCount > 0" class="play-card-likes">
              <i class="ti ti-heart" /> {{ item.likedCount }}
            </span>
          </div>
          <div v-if="item.summary" class="play-card-summary">{{ item.summary }}</div>
        </button>
      </div>
    </template>

    <!-- Ready mode (before execution) -->
    <template v-else-if="mode === 'ready'">
      <div class="play-ready-scroll">
        <div v-if="fetching" class="column-empty">Loading...</div>
        <div v-else-if="fetchError" class="column-empty column-error">{{ fetchError }}</div>
        <template v-else-if="flash">
          <div class="play-ready">
            <div class="play-ready-title">{{ flash.title }}</div>
            <div v-if="flash.summary" class="play-ready-summary">{{ flash.summary }}</div>
            <button class="_button play-start-btn" @click="startPlay">
              <i class="ti ti-player-play" /> Play
            </button>
            <div class="play-ready-info">
              <i class="ti ti-heart" /> {{ flash.likedCount }}
            </div>
          </div>

          <div class="play-footer">
            <div class="play-footer-author">
              <img v-if="flash.user.avatarUrl" :src="flash.user.avatarUrl" class="play-footer-avatar" />
              By @{{ flash.user.username }}
            </div>
            <div class="play-footer-dates">
              <div v-if="flash.createdAt !== flash.updatedAt">
                <i class="ti ti-clock" /> Updated: {{ new Date(flash.updatedAt).toLocaleDateString() }}
              </div>
              <div>
                <i class="ti ti-clock" /> Created: {{ new Date(flash.createdAt).toLocaleDateString() }}
              </div>
            </div>
          </div>
        </template>
      </div>
    </template>

    <!-- Started mode (executing / executed) -->
    <template v-else>
      <div class="play-started-scroll">
        <!-- UI output -->
        <div v-if="uiComponents.length" class="play-ui">
          <AiScriptUiRenderer
            :components="uiComponents"
            :interpreter="(interpreter as Interpreter | null)"
            :server-url="serverUrl"
          />
        </div>

        <!-- Console output -->
        <div v-if="consoleOutput.length" class="play-console">
          <div
            v-for="(line, i) in consoleOutput"
            :key="i"
            class="console-line"
            :class="{ error: line.isError }"
          >
            {{ line.text }}
          </div>
        </div>

        <!-- Error -->
        <div v-if="runError" class="play-error">{{ runError }}</div>

        <!-- Loading -->
        <div v-if="running && !uiComponents.length && !runError" class="column-empty">
          Running...
        </div>

        <!-- Actions -->
        <div v-if="!running" class="play-actions">
          <div class="play-actions-row">
            <button class="_button play-action-btn" title="Reload" @click="reload">
              <i class="ti ti-reload" />
            </button>
          </div>
          <div v-if="flash" class="play-actions-row">
            <button
              class="_button play-action-btn"
              :class="{ liked: flash.isLiked }"
              @click="toggleLike"
            >
              <i :class="flash.isLiked ? 'ti ti-heart-filled' : 'ti ti-heart'" />
              {{ flash.likedCount }}
            </button>
          </div>
        </div>
      </div>
    </template>
  </DeckColumn>
</template>

<style scoped>
@import "./column-common.css";

/* --- List mode --- */

.play-tabs {
  display: flex;
  border-bottom: 1px solid var(--nd-divider);
  flex-shrink: 0;
}

.play-tab {
  flex: 1;
  padding: 8px 0;
  text-align: center;
  font-size: 0.8em;
  font-weight: 600;
  color: var(--nd-fg);
  opacity: 0.5;
  transition: opacity 0.15s, border-color 0.15s;
  border-bottom: 2px solid transparent;
}

.play-tab:hover {
  opacity: 0.8;
}

.play-tab.active {
  opacity: 1;
  color: var(--nd-accent);
  border-bottom-color: var(--nd-accent);
}

.play-list {
  flex: 1;
  overflow-y: auto;
  scrollbar-color: var(--nd-scrollbarHandle) transparent;
  scrollbar-width: thin;
}

.play-card {
  display: flex;
  flex-direction: column;
  gap: 4px;
  width: 100%;
  padding: 12px 14px;
  text-align: left;
  border-bottom: 1px solid var(--nd-divider);
  transition: background 0.15s;
}

.play-card:hover {
  background: var(--nd-buttonHoverBg);
}

.play-card-title {
  font-size: 0.9em;
  font-weight: 600;
  color: var(--nd-fgHighlighted);
}

.play-card-meta {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 0.75em;
  opacity: 0.6;
}

.play-card-likes {
  display: flex;
  align-items: center;
  gap: 2px;
}

.play-card-summary {
  font-size: 0.8em;
  opacity: 0.7;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

/* --- Ready mode --- */

.play-ready-scroll {
  flex: 1;
  overflow-y: auto;
  scrollbar-color: var(--nd-scrollbarHandle) transparent;
  scrollbar-width: thin;
}

.play-ready {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  padding: 28px 20px;
  margin: 12px;
  border-radius: 10px;
  background: var(--nd-panel);
}

.play-ready-title {
  font-size: 1.2em;
  font-weight: bold;
  color: var(--nd-fgHighlighted);
  text-align: center;
}

.play-ready-summary {
  font-size: 0.9em;
  text-align: center;
  opacity: 0.8;
  white-space: pre-wrap;
  line-height: 1.5;
}

.play-start-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  margin: 8px 0;
  padding: 10px 32px;
  border-radius: 999px;
  background: linear-gradient(90deg, var(--nd-accent), color-mix(in srgb, var(--nd-accent), #fff 20%));
  color: #fff;
  font-size: 1em;
  font-weight: bold;
  transition: opacity 0.15s;
}

.play-start-btn:hover {
  opacity: 0.85;
}

.play-ready-info {
  font-size: 0.85em;
  opacity: 0.6;
}

.play-footer {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px 20px;
  margin: 0 12px 12px;
}

.play-footer-author {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 0.85em;
  opacity: 0.7;
}

.play-footer-avatar {
  width: 20px;
  height: 20px;
  border-radius: 50%;
}

.play-footer-dates {
  font-size: 0.75em;
  opacity: 0.5;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

/* --- Started mode --- */

.play-started-scroll {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow-y: auto;
  scrollbar-color: var(--nd-scrollbarHandle) transparent;
  scrollbar-width: thin;
}

.play-ui {
  padding: 16px 12px;
}

.play-console {
  padding: 8px 10px;
  margin: 0 12px;
  border-radius: 6px;
  background: var(--nd-bg);
  font-family: 'Fira Code', 'Cascadia Code', 'Consolas', monospace;
  font-size: 0.8em;
  line-height: 1.6;
}

.console-line {
  white-space: pre-wrap;
  word-break: break-all;
}

.console-line.error {
  color: var(--nd-love);
}

.play-error {
  padding: 8px 10px;
  margin: 0 12px;
  border-radius: 6px;
  background: rgba(221, 46, 68, 0.1);
  color: var(--nd-love);
  font-size: 0.8em;
  white-space: pre-wrap;
}

.play-actions {
  margin-top: auto;
  border-top: 1px solid var(--nd-divider);
}

.play-actions-row {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 12px;
  padding: 10px 16px;
  border-bottom: 1px solid var(--nd-divider);
}

.play-actions-row:last-child {
  border-bottom: none;
}

.play-action-btn {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 6px 14px;
  border-radius: 999px;
  background: var(--nd-buttonBg);
  color: var(--nd-fg);
  font-size: 0.8em;
  transition: background 0.15s;
}

.play-action-btn:hover {
  background: var(--nd-buttonHoverBg);
}

.play-action-btn.liked {
  color: var(--nd-love);
}
</style>
