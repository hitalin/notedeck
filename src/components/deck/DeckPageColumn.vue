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
import {
  cleanupNoteDeckEnv,
  createNoteDeckEnv,
  type NoteDeckEnvContext,
} from '@/aiscript/notedeck-api'
import { applyPageViewInterruptors } from '@/aiscript/plugin-api'
import { sanitizeCode } from '@/aiscript/sanitize'
import { createAiScriptUiLib, type UiComponent } from '@/aiscript/ui'
import { useCommandStore } from '@/commands/registry'
import AiScriptDialog from '@/components/common/AiScriptDialog.vue'
import AiScriptToast from '@/components/common/AiScriptToast.vue'
import MkMfm from '@/components/common/MkMfm.vue'
import { useAccountsStore } from '@/stores/accounts'
import type { DeckColumn as DeckColumnType } from '@/stores/deck'
import { useDeckStore } from '@/stores/deck'
import { useThemeStore } from '@/stores/theme'
import { AppError } from '@/utils/errors'
import DeckColumn from './DeckColumn.vue'
import AiScriptUiRenderer from './widgets/AiScriptUiRenderer.vue'

const props = defineProps<{
  column: DeckColumnType
}>()

const deckStore = useDeckStore()
const commandStore = useCommandStore()
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
type Mode = 'list' | 'view'
const mode = ref<Mode>('list')

// --- List mode ---
type Tab = 'featured' | 'my' | 'likes'
const activeTab = ref<Tab>('featured')

interface PageSummary {
  id: string
  title: string
  summary: string | null
  name: string
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

const listItems = ref<PageSummary[]>([])
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
    featured: 'pages/featured',
    my: 'i/pages',
    likes: 'i/page-likes',
  }

  try {
    const raw = await invoke<
      PageSummary[] | { id: string; page: PageSummary }[]
    >('api_request', {
      accountId: props.column.accountId,
      endpoint: endpointMap[t],
      params: { limit: 30 },
    })
    // i/page-likes returns { id, page } wrapper objects
    listItems.value =
      t === 'likes'
        ? (raw as { id: string; page: PageSummary }[]).map((item) => item.page)
        : (raw as PageSummary[])
  } catch (e) {
    listError.value = AppError.from(e).message
  } finally {
    listLoading.value = false
  }
}

// If pageId is set, open it directly; otherwise show list
if (props.column.pageId) {
  openPage(props.column.pageId)
} else {
  fetchList()
}

// --- Page detail ---
interface PageContent {
  id: string
  type: string
  text?: string
  // biome-ignore lint: AiScript page content varies
  [key: string]: any
}

interface PageDetail {
  id: string
  title: string
  summary: string | null
  name: string
  content: PageContent[]
  variables: unknown[]
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

const page = ref<PageDetail | null>(null)
const fetchError = ref<string | null>(null)
const fetching = ref(false)

const uiComponents = ref<UiComponent[]>([])
const consoleOutput = ref<{ text: string; isError: boolean }[]>([])
const runError = ref<string | null>(null)
const running = ref(false)
const toastRef = ref<InstanceType<typeof AiScriptToast> | null>(null)
const dialogRef = ref<InstanceType<typeof AiScriptDialog> | null>(null)
const interpreter = ref<Interpreter | null>(null)
let currentNdCtx: Parameters<typeof cleanupNoteDeckEnv>[0] | null = null

async function openPage(pageId: string) {
  if (!props.column.accountId) return
  mode.value = 'view'
  page.value = null
  fetchError.value = null
  fetching.value = true
  resetRunState()

  try {
    const detail = await invoke<PageDetail>('api_request', {
      accountId: props.column.accountId,
      endpoint: 'pages/show',
      params: { pageId },
    })
    page.value = applyPageViewInterruptors(detail)
    // If the page has a script, execute it
    if (detail.script) {
      running.value = true
      await executePage(detail)
    }
  } catch (e) {
    fetchError.value = AppError.from(e).message
  } finally {
    fetching.value = false
  }
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

async function executePage(detail: PageDetail) {
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
    {
      api: apiOption,
      storagePrefix: `page-${detail.id}`,
      onDialog: (title, text, type) =>
        dialogRef.value?.showDialog(title, text, type) ?? Promise.resolve(),
      onConfirm: (title, text) =>
        dialogRef.value?.showConfirm(title, text) ?? Promise.resolve(false),
      onToast: (text, type) => toastRef.value?.show(text, type),
    },
    {
      THIS_ID: detail.id,
      THIS_URL: `${serverUrl.value}/@${detail.user.username}/pages/${detail.name}`,
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

  if (currentNdCtx) cleanupNoteDeckEnv(currentNdCtx)
  const ndCtx: NoteDeckEnvContext = {
    deckStore,
    commandStore,
    registeredCommandIds: [] as string[],
  }
  const ndEnv = createNoteDeckEnv(ndCtx)
  currentNdCtx = ndCtx

  const interp = createAiScriptInterpreter(
    { ...env, ...ndEnv, ...ui },
    ioOpts,
    legacy,
  )
  ndCtx.interpreter = interp
  interpreter.value = interp
  try {
    await execAiScript(interp, ast, legacy)
  } catch (e) {
    runError.value = AppError.from(e).message
  }
  running.value = false
}

async function toggleLike() {
  if (!page.value || !props.column.accountId) return
  const endpoint = page.value.isLiked ? 'pages/unlike' : 'pages/like'
  try {
    await invoke('api_request', {
      accountId: props.column.accountId,
      endpoint,
      params: { pageId: page.value.id },
    })
    page.value.isLiked = !page.value.isLiked
    page.value.likedCount += page.value.isLiked ? 1 : -1
  } catch {
    // ignore
  }
}

function goBack() {
  mode.value = 'list'
  page.value = null
  fetchError.value = null
  resetRunState()
  fetchList()
}

// Computed: extract MFM text blocks from page content
const contentTexts = computed(() => {
  if (!page.value?.content) return []
  return page.value.content
    .filter((block) => block.type === 'text' && block.text)
    .map((block) => block.text as string)
})

const hasScript = computed(() => !!page.value?.script)
</script>

<template>
  <DeckColumn :column-id="column.id" :title="column.name ?? 'Pages'" :theme-vars="columnThemeVars">
    <AiScriptToast ref="toastRef" />
    <AiScriptDialog ref="dialogRef" />
    <template #header-icon>
      <i class="ti ti-note tl-header-icon" />
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
      <div class="page-tabs">
        <button
          v-for="tab in (['featured', 'my', 'likes'] as Tab[])"
          :key="tab"
          class="_button page-tab"
          :class="{ active: activeTab === tab }"
          @click="fetchList(tab)"
        >
          {{ tab === 'featured' ? '人気' : tab === 'my' ? '自分の' : 'いいね' }}
        </button>
      </div>

      <div class="page-list">
        <div v-if="listLoading" class="column-empty">読み込み中...</div>
        <div v-else-if="listError" class="column-empty column-error">{{ listError }}</div>
        <div v-else-if="listItems.length === 0" class="column-empty">ページが見つかりません</div>
        <button
          v-for="item in listItems"
          :key="item.id"
          class="_button page-card"
          @click="openPage(item.id)"
        >
          <div class="page-card-title">{{ item.title }}</div>
          <div class="page-card-meta">
            <span class="page-card-author">@{{ item.user.username }}</span>
            <span v-if="item.likedCount > 0" class="page-card-likes">
              <i class="ti ti-heart" /> {{ item.likedCount }}
            </span>
          </div>
          <div v-if="item.summary" class="page-card-summary">{{ item.summary }}</div>
        </button>
      </div>
    </template>

    <!-- View mode -->
    <template v-else>
      <div class="page-view-scroll">
        <div v-if="fetching" class="column-empty">Loading...</div>
        <div v-else-if="fetchError" class="column-empty column-error">{{ fetchError }}</div>
        <template v-else-if="page">
          <!-- Page header -->
          <div class="page-header">
            <div class="page-title">{{ page.title }}</div>
            <div v-if="page.summary" class="page-summary">{{ page.summary }}</div>
          </div>

          <!-- AiScript UI output -->
          <div v-if="uiComponents.length" class="page-ui">
            <AiScriptUiRenderer
              :components="uiComponents"
              :interpreter="(interpreter as Interpreter | null)"
              :server-url="serverUrl"
            />
          </div>

          <!-- MFM content blocks -->
          <div v-if="contentTexts.length" class="page-content">
            <MkMfm
              v-for="(text, i) in contentTexts"
              :key="i"
              :text="text"
              :server-host="account?.host"
              :account-id="column.accountId ?? undefined"
            />
          </div>

          <!-- Console output -->
          <div v-if="consoleOutput.length" class="page-console">
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
          <div v-if="runError" class="page-error">{{ runError }}</div>

          <!-- Loading (script running, no UI yet) -->
          <div v-if="running && !uiComponents.length && !runError" class="column-empty">
            Running...
          </div>

          <!-- Footer -->
          <div class="page-footer">
            <div class="page-footer-author">
              <img v-if="page.user.avatarUrl" :src="page.user.avatarUrl" class="page-footer-avatar" />
              By @{{ page.user.username }}
            </div>
            <div class="page-footer-dates">
              <div v-if="page.createdAt !== page.updatedAt">
                <i class="ti ti-clock" /> Updated: {{ new Date(page.updatedAt).toLocaleDateString() }}
              </div>
              <div>
                <i class="ti ti-clock" /> Created: {{ new Date(page.createdAt).toLocaleDateString() }}
              </div>
            </div>
            <div class="page-footer-actions">
              <button
                class="_button page-action-btn"
                :class="{ liked: page.isLiked }"
                @click="toggleLike"
              >
                <i :class="page.isLiked ? 'ti ti-heart-filled' : 'ti ti-heart'" />
                {{ page.likedCount }}
              </button>
            </div>
          </div>
        </template>
      </div>
    </template>
  </DeckColumn>
</template>

<style scoped>
@import "./column-common.css";

/* --- List mode --- */

.page-tabs {
  display: flex;
  border-bottom: 1px solid var(--nd-divider);
  flex-shrink: 0;
}

.page-tab {
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

.page-tab:hover {
  opacity: 0.8;
}

.page-tab.active {
  opacity: 1;
  color: var(--nd-accent);
  border-bottom-color: var(--nd-accent);
}

.page-list {
  flex: 1;
  overflow-y: auto;
  scrollbar-color: var(--nd-scrollbarHandle) transparent;
  scrollbar-width: thin;
}

.page-card {
  display: flex;
  flex-direction: column;
  gap: 4px;
  width: 100%;
  padding: 12px 14px;
  text-align: left;
  border-bottom: 1px solid var(--nd-divider);
  transition: background 0.15s;
}

.page-card:hover {
  background: var(--nd-buttonHoverBg);
}

.page-card-title {
  font-size: 0.9em;
  font-weight: 600;
  color: var(--nd-fgHighlighted);
}

.page-card-meta {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 0.75em;
  opacity: 0.6;
}

.page-card-likes {
  display: flex;
  align-items: center;
  gap: 2px;
}

.page-card-summary {
  font-size: 0.8em;
  opacity: 0.7;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

/* --- View mode --- */

.page-view-scroll {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow-y: auto;
  scrollbar-color: var(--nd-scrollbarHandle) transparent;
  scrollbar-width: thin;
}

.page-header {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 20px 16px 12px;
}

.page-title {
  font-size: 1.2em;
  font-weight: bold;
  color: var(--nd-fgHighlighted);
}

.page-summary {
  font-size: 0.9em;
  opacity: 0.7;
  white-space: pre-wrap;
  line-height: 1.5;
}

.page-ui {
  padding: 16px 12px;
}

.page-content {
  padding: 8px 16px 16px;
  line-height: 1.7;
  word-break: break-word;
}

.page-console {
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

.page-error {
  padding: 8px 10px;
  margin: 0 12px;
  border-radius: 6px;
  background: rgba(221, 46, 68, 0.1);
  color: var(--nd-love);
  font-size: 0.8em;
  white-space: pre-wrap;
}

.page-footer {
  margin-top: auto;
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px 16px;
  border-top: 1px solid var(--nd-divider);
}

.page-footer-author {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 0.85em;
  opacity: 0.7;
}

.page-footer-avatar {
  width: 20px;
  height: 20px;
  border-radius: 50%;
}

.page-footer-dates {
  font-size: 0.75em;
  opacity: 0.5;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.page-footer-actions {
  display: flex;
  gap: 8px;
  padding-top: 4px;
}

.page-action-btn {
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

.page-action-btn:hover {
  background: var(--nd-buttonHoverBg);
}

.page-action-btn.liked {
  color: var(--nd-love);
}
</style>
