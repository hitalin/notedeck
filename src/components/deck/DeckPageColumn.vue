<script setup lang="ts">
import { type Ast, type Interpreter } from '@syuilo/aiscript'
import { openUrl } from '@tauri-apps/plugin-opener'
import { computed, defineAsyncComponent, ref, useTemplateRef } from 'vue'
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
import LoadingSpinner from '@/components/common/LoadingSpinner.vue'
import MkMfm from '@/components/common/MkMfm.vue'
import { getAccountAvatarUrl } from '@/stores/accounts'
import { useToast } from '@/stores/toast'
import { invoke } from '@/utils/tauriInvoke'

const MkPostForm = defineAsyncComponent(
  () => import('@/components/common/MkPostForm.vue'),
)

import { useColumnTheme } from '@/composables/useColumnTheme'
import { usePortal } from '@/composables/usePortal'
import { useSwipeTab } from '@/composables/useSwipeTab'
import { useTabSlide } from '@/composables/useTabSlide'
import type { DeckColumn as DeckColumnType } from '@/stores/deck'
import { useDeckStore } from '@/stores/deck'
import { AppError } from '@/utils/errors'
import DeckColumn from './DeckColumn.vue'
import type { PostFormRequest } from './widgets/AiScriptUiRenderer.vue'
import AiScriptUiRenderer from './widgets/AiScriptUiRenderer.vue'

const props = defineProps<{
  column: DeckColumnType
}>()

const deckStore = useDeckStore()
const commandStore = useCommandStore()

const { account, columnThemeVars } = useColumnTheme(() => props.column)
const serverUrl = computed(() =>
  account.value ? `https://${account.value.host}` : '',
)

// --- Mode ---
type Mode = 'list' | 'view'
const mode = ref<Mode>('list')

// --- List mode ---
type Tab = 'featured' | 'my' | 'likes'
const tabs: Tab[] = ['featured', 'my', 'likes']
const activeTab = ref<Tab>('featured')
const listContentRef = ref<HTMLElement | null>(null)

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
    >('api_get_pages', {
      accountId: props.column.accountId,
      endpoint: endpointMap[t],
      limit: 30,
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

// Tab slide animation
const pageTabIndex = computed(() => tabs.indexOf(activeTab.value))
useTabSlide(pageTabIndex, listContentRef)

// Swipe / wheel to switch tabs (list mode only)
useSwipeTab(
  listContentRef,
  () => {
    if (mode.value !== 'list') return false
    const idx = tabs.indexOf(activeTab.value)
    const next = tabs[idx + 1]
    if (next) {
      fetchList(next)
      return true
    }
    return false
  },
  () => {
    if (mode.value !== 'list') return false
    const idx = tabs.indexOf(activeTab.value)
    const prev = tabs[idx - 1]
    if (prev) {
      fetchList(prev)
      return true
    }
    return false
  },
)

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

const pageCreatedDate = computed(() =>
  page.value ? new Date(page.value.createdAt).toLocaleDateString() : '',
)
const pageUpdatedDate = computed(() =>
  page.value ? new Date(page.value.updatedAt).toLocaleDateString() : '',
)

const uiComponents = ref<UiComponent[]>([])
const consoleOutput = ref<{ text: string; isError: boolean }[]>([])
const runError = ref<string | null>(null)
const running = ref(false)
const { show: showToast } = useToast()
const dialogRef = ref<InstanceType<typeof AiScriptDialog> | null>(null)
const interpreter = ref<Interpreter | null>(null)
let currentNdCtx: Parameters<typeof cleanupNoteDeckEnv>[0] | null = null

const postPortalRef = useTemplateRef<HTMLElement>('postPortalRef')
usePortal(postPortalRef)

const showPostForm = ref(false)
const postFormData = ref<PostFormRequest>({})

function handlePost(form: PostFormRequest) {
  if (!props.column.accountId) return
  postFormData.value = form
  showPostForm.value = true
}

function closePostForm() {
  showPostForm.value = false
  postFormData.value = {}
}

async function openPage(pageId: string) {
  if (!props.column.accountId) return
  mode.value = 'view'
  page.value = null
  fetchError.value = null
  fetching.value = true
  resetRunState()

  try {
    const detail = await invoke<PageDetail>('api_get_page', {
      accountId: props.column.accountId,
      pageId,
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
      onToast: (text, type) => showToast(text, type),
    },
    {
      THIS_ID: detail.id,
      THIS_URL: `${serverUrl.value}/@${detail.user.username}/pages/${detail.name}`,
      USER_ID: account.value?.userId ?? '',
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
  const command = page.value.isLiked ? 'api_unlike_page' : 'api_like_page'
  try {
    await invoke(command, {
      accountId: props.column.accountId,
      pageId: page.value.id,
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

const isOwnPage = computed(
  () =>
    page.value && account.value && page.value.userId === account.value.userId,
)

const pageListRef = useTemplateRef<HTMLElement>('pageListRef')
const pageViewScrollRef = useTemplateRef<HTMLElement>('pageViewScrollRef')

function scrollToTop() {
  const el = mode.value === 'list' ? pageListRef.value : pageViewScrollRef.value
  el?.scrollTo({ top: 0, behavior: 'smooth' })
}

const pageWebUrl = computed(() => {
  if (!page.value || !serverUrl.value) return undefined
  return `${serverUrl.value}/@${page.value.user.username}/pages/${page.value.name}`
})

const pageEditUrl = computed(() => {
  if (!isOwnPage.value || !pageWebUrl.value) return undefined
  return `${serverUrl.value}/pages/edit/${page.value?.id}`
})
</script>

<template>
  <DeckColumn :column-id="column.id" :title="column.name ?? 'ページ'" :theme-vars="columnThemeVars" :web-ui-url="pageWebUrl" @header-click="scrollToTop" @refresh="fetchList()">
    <AiScriptDialog ref="dialogRef" />
    <template #header-icon>
      <i class="ti ti-note" :class="$style.tlHeaderIcon" />
    </template>

    <template #header-meta>
      <button v-if="mode !== 'list'" class="_button" :class="$style.headerRefresh" title="戻る" @click.stop="goBack">
        <i class="ti ti-arrow-left" />
      </button>
      <div v-if="account" :class="$style.headerAccount">
        <img :src="getAccountAvatarUrl(account)" :class="$style.headerAvatar" />
      </div>
    </template>

    <!-- List mode -->
    <template v-if="mode === 'list'">
      <div ref="listContentRef" :class="$style.pageListContent">
      <div :class="$style.pageTabs">
        <button
          v-for="tab in (['featured', 'my', 'likes'] as Tab[])"
          :key="tab"
          class="_button"
          :class="[$style.pageTab, { [$style.active]: activeTab === tab }]"
          @click="fetchList(tab)"
        >
          {{ tab === 'featured' ? '人気' : tab === 'my' ? '自分の' : 'いいね' }}
        </button>
      </div>

      <div ref="pageListRef" :class="$style.pageList">
        <div v-if="listLoading" :class="$style.columnLoading"><LoadingSpinner /></div>
        <div v-else-if="listError" :class="[$style.columnEmpty, $style.columnError]">{{ listError }}</div>
        <div v-else-if="listItems.length === 0" :class="$style.columnEmpty">ページが見つかりません</div>
        <button
          v-for="item in listItems"
          :key="item.id"
          class="_button"
          :class="$style.pageCard"
          @click="openPage(item.id)"
        >
          <div :class="$style.pageCardTitle">{{ item.title }}</div>
          <div :class="$style.pageCardMeta">
            <span :class="$style.pageCardAuthor">@{{ item.user.username }}</span>
            <span v-if="item.likedCount > 0" :class="$style.pageCardLikes">
              <i class="ti ti-heart" /> {{ item.likedCount }}
            </span>
          </div>
          <div v-if="item.summary" :class="$style.pageCardSummary">{{ item.summary }}</div>
        </button>
      </div>
      </div>
    </template>

    <!-- View mode -->
    <template v-else>
      <div ref="pageViewScrollRef" :class="$style.pageViewScroll">
        <div v-if="fetching" :class="$style.columnLoading"><LoadingSpinner /></div>
        <div v-else-if="fetchError" :class="[$style.columnEmpty, $style.columnError]">{{ fetchError }}</div>
        <template v-else-if="page">
          <!-- Page header -->
          <div :class="$style.pageHeader">
            <div :class="$style.pageTitle">{{ page.title }}</div>
            <div v-if="page.summary" :class="$style.pageSummary">{{ page.summary }}</div>
          </div>

          <!-- AiScript UI output -->
          <div v-if="uiComponents.length" :class="$style.pageUi">
            <AiScriptUiRenderer
              :components="uiComponents"
              :interpreter="(interpreter as Interpreter | null)"
              :server-url="serverUrl"
              @post="handlePost"
            />
          </div>

          <!-- MFM content blocks -->
          <div v-if="contentTexts.length" :class="$style.pageContent">
            <MkMfm
              v-for="(text, i) in contentTexts"
              :key="i"
              :text="text"
              :server-host="account?.host"
              :account-id="column.accountId ?? undefined"
            />
          </div>

          <!-- Console output -->
          <div v-if="consoleOutput.length" :class="$style.pageConsole">
            <div
              v-for="(line, i) in consoleOutput"
              :key="i"
              :class="[$style.consoleLine, { [$style.error]: line.isError }]"
            >
              {{ line.text }}
            </div>
          </div>

          <!-- Error -->
          <div v-if="runError" :class="$style.pageError">{{ runError }}</div>

          <!-- Loading (script running, no UI yet) -->
          <div v-if="running && !uiComponents.length && !runError" :class="$style.columnEmpty">
            Running...
          </div>

          <!-- Footer -->
          <div :class="$style.pageFooter">
            <div :class="$style.pageFooterAuthor">
              <img :src="page.user.avatarUrl || '/avatar-default.svg'" :class="$style.pageFooterAvatar" @error="(e: Event) => (e.target as HTMLImageElement).src = '/avatar-error.svg'" />
              By @{{ page.user.username }}
            </div>
            <div :class="$style.pageFooterDates">
              <div v-if="page.createdAt !== page.updatedAt">
                <i class="ti ti-clock" /> Updated: {{ pageUpdatedDate }}
              </div>
              <div>
                <i class="ti ti-clock" /> Created: {{ pageCreatedDate }}
              </div>
            </div>
            <div :class="$style.pageFooterActions">
              <button
                class="_button"
                :class="[$style.pageActionBtn, { [$style.liked]: page.isLiked }]"
                @click="toggleLike"
              >
                <i class="ti ti-heart" />
                {{ page.likedCount }}
              </button>
              <button
                v-if="pageEditUrl"
                class="_button"
                :class="$style.pageActionBtn"
                @click="pageEditUrl && openUrl(pageEditUrl)"
              >
                <i class="ti ti-pencil" />
                編集
              </button>
            </div>
          </div>
        </template>
      </div>
    </template>
  </DeckColumn>

  <div v-if="showPostForm && props.column.accountId" ref="postPortalRef">
    <MkPostForm
      :account-id="props.column.accountId"
      :initial-text="postFormData.text"
      :initial-cw="postFormData.cw"
      :initial-visibility="postFormData.visibility"
      :initial-local-only="postFormData.localOnly"
      @close="closePostForm"
      @posted="closePostForm"
    />
  </div>
</template>

<style lang="scss" module>
@use "./column-common.module.scss";

/* --- List mode --- */

.pageListContent {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
}

.pageTabs {
  display: flex;
  border-bottom: 1px solid var(--nd-divider);
  flex-shrink: 0;
}

.pageTab {
  flex: 1;
  padding: 8px 0;
  text-align: center;
  font-size: 0.8em;
  font-weight: 600;
  color: var(--nd-fg);
  opacity: 0.5;
  transition: opacity var(--nd-duration-base), border-color var(--nd-duration-base);
  border-bottom: 2px solid transparent;

  &:hover {
    opacity: 0.8;
  }

  &.active {
    opacity: 1;
    color: var(--nd-accent);
    border-bottom-color: var(--nd-accent);
  }
}

.active {
  /* used as modifier */
}

.pageList {
  flex: 1;
  overflow-y: auto;
  scrollbar-color: var(--nd-scrollbarHandle) transparent;
  scrollbar-width: thin;
}

.pageCard {
  display: flex;
  flex-direction: column;
  gap: 4px;
  width: 100%;
  padding: 12px 14px;
  text-align: left;
  border-bottom: 1px solid var(--nd-divider);
  transition: background var(--nd-duration-base);
  contain: layout style paint;
  content-visibility: auto;
  contain-intrinsic-size: auto 65px;

  &:hover {
    background: var(--nd-buttonHoverBg);
  }
}

.pageCardTitle {
  font-size: 0.9em;
  font-weight: 600;
  color: var(--nd-fgHighlighted);
}

.pageCardMeta {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 0.75em;
  opacity: 0.6;
}

.pageCardAuthor {
  /* placeholder for specificity */
}

.pageCardLikes {
  display: flex;
  align-items: center;
  gap: 2px;
}

.pageCardSummary {
  font-size: 0.8em;
  opacity: 0.7;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

/* --- View mode --- */

.pageViewScroll {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow-y: auto;
  scrollbar-color: var(--nd-scrollbarHandle) transparent;
  scrollbar-width: thin;
}

.pageHeader {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 20px 16px 12px;
}

.pageTitle {
  font-size: 1.2em;
  font-weight: bold;
  color: var(--nd-fgHighlighted);
}

.pageSummary {
  font-size: 0.9em;
  opacity: 0.7;
  white-space: pre-wrap;
  line-height: 1.5;
}

.pageUi {
  padding: 16px 12px;
}

.pageContent {
  padding: 8px 16px 16px;
  line-height: 1.7;
  word-break: break-word;
}

.pageConsole {
  padding: 8px 10px;
  margin: 0 12px;
  border-radius: var(--nd-radius-sm);
  background: var(--nd-bg);
  font-family: 'Fira Code', 'Cascadia Code', 'Consolas', monospace;
  font-size: 0.8em;
  line-height: 1.6;
}

.consoleLine {
  white-space: pre-wrap;
  word-break: break-all;

  &.error {
    color: var(--nd-love);
  }
}

.error {
  /* used as modifier */
}

.pageError {
  padding: 8px 10px;
  margin: 0 12px;
  border-radius: var(--nd-radius-sm);
  background: var(--nd-love-subtle);
  color: var(--nd-love);
  font-size: 0.8em;
  white-space: pre-wrap;
}

.pageFooter {
  margin-top: auto;
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px 16px;
  border-top: 1px solid var(--nd-divider);
}

.pageFooterAuthor {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 0.85em;
  opacity: 0.7;
}

.pageFooterAvatar {
  width: 20px;
  height: 20px;
  border-radius: 50%;
}

.pageFooterDates {
  font-size: 0.75em;
  opacity: 0.5;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.pageFooterActions {
  display: flex;
  gap: 8px;
  padding-top: 4px;
}

.pageActionBtn {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 6px 14px;
  border-radius: var(--nd-radius-full);
  background: var(--nd-buttonBg);
  color: var(--nd-fg);
  font-size: 0.8em;
  transition: background var(--nd-duration-base);

  &:hover {
    background: var(--nd-buttonHoverBg);
  }

  &.liked {
    color: var(--nd-love);
  }
}

.liked {
  /* used as modifier */
}
</style>
