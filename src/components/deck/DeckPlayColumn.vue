<script setup lang="ts">
import { type Ast, type Interpreter } from '@syuilo/aiscript'
import { computed, defineAsyncComponent, ref } from 'vue'
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
import { sanitizeCode } from '@/aiscript/sanitize'
import { createAiScriptUiLib, type UiComponent } from '@/aiscript/ui'
import { useCommandStore } from '@/commands/registry'
import AiScriptDialog from '@/components/common/AiScriptDialog.vue'
import AiScriptToast from '@/components/common/AiScriptToast.vue'
import { invoke } from '@/utils/tauriInvoke'

const MkPostForm = defineAsyncComponent(
  () => import('@/components/common/MkPostForm.vue'),
)

import { useColumnTheme } from '@/composables/useColumnTheme'
import { useSwipeTab } from '@/composables/useSwipeTab'
import { useTabSlide } from '@/composables/useTabSlide'
import { getAccountAvatarUrl } from '@/stores/accounts'
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
type Mode = 'list' | 'ready' | 'started'
const mode = ref<Mode>('list')

// --- List mode ---
type Tab = 'featured' | 'my' | 'likes'
const tabs: Tab[] = ['featured', 'my', 'likes']
const activeTab = ref<Tab>('featured')
const listContentRef = ref<HTMLElement | null>(null)

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
    >('api_get_flashes', {
      accountId: props.column.accountId,
      endpoint: endpointMap[t],
      limit: 30,
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

// Tab slide animation
const playTabIndex = computed(() => tabs.indexOf(activeTab.value))
useTabSlide(playTabIndex, listContentRef)

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

const flashCreatedDate = computed(() =>
  flash.value ? new Date(flash.value.createdAt).toLocaleDateString() : '',
)
const flashUpdatedDate = computed(() =>
  flash.value ? new Date(flash.value.updatedAt).toLocaleDateString() : '',
)

const uiComponents = ref<UiComponent[]>([])
const consoleOutput = ref<{ text: string; isError: boolean }[]>([])
const runError = ref<string | null>(null)
const running = ref(false)
const toastRef = ref<InstanceType<typeof AiScriptToast> | null>(null)
const dialogRef = ref<InstanceType<typeof AiScriptDialog> | null>(null)
const interpreter = ref<Interpreter | null>(null)
let currentNdCtx: Parameters<typeof cleanupNoteDeckEnv>[0] | null = null

// --- Post form ---
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

// --- Open Play (show ready screen) ---
async function openPlay(flashId: string) {
  if (!props.column.accountId) return
  mode.value = 'ready'
  flash.value = null
  fetchError.value = null
  fetching.value = true
  resetRunState()

  try {
    flash.value = await invoke<FlashDetail>('api_get_flash', {
      accountId: props.column.accountId,
      flashId,
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
    {
      api: apiOption,
      storagePrefix: `play-${detail.id}`,
      onDialog: (title, text, type) =>
        dialogRef.value?.showDialog(title, text, type) ?? Promise.resolve(),
      onConfirm: (title, text) =>
        dialogRef.value?.showConfirm(title, text) ?? Promise.resolve(false),
      onToast: (text, type) => toastRef.value?.show(text, type),
    },
    {
      THIS_ID: detail.id,
      THIS_URL: `${serverUrl.value}/play/${detail.id}`,
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
  if (!flash.value || !props.column.accountId) return
  const command = flash.value.isLiked ? 'api_unlike_flash' : 'api_like_flash'
  try {
    await invoke(command, {
      accountId: props.column.accountId,
      flashId: flash.value.id,
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
    <AiScriptToast ref="toastRef" />
    <AiScriptDialog ref="dialogRef" />
    <template #header-icon>
      <i class="ti ti-player-play" :class="$style.tlHeaderIcon" />
    </template>

    <template #header-meta>
      <button v-if="mode !== 'list'" class="_button" :class="$style.headerRefresh" title="Back" @click.stop="goBack">
        <i class="ti ti-arrow-left" />
      </button>
      <button v-else class="_button" :class="$style.headerRefresh" title="Refresh" :disabled="listLoading" @click.stop="fetchList()">
        <i class="ti ti-refresh" :class="{ [String($style.spin)]: listLoading }" />
      </button>
      <div v-if="account" :class="$style.headerAccount">
        <img :src="getAccountAvatarUrl(account)" :class="$style.headerAvatar" />
      </div>
    </template>

    <!-- List mode -->
    <template v-if="mode === 'list'">
      <div ref="listContentRef" :class="$style.playListContent">
      <div :class="$style.playTabs">
        <button
          v-for="tab in (['featured', 'my', 'likes'] as Tab[])"
          :key="tab"
          class="_button"
          :class="[$style.playTab, { [$style.active]: activeTab === tab }]"
          @click="fetchList(tab)"
        >
          {{ tab === 'featured' ? '人気' : tab === 'my' ? '自分の' : 'いいね' }}
        </button>
      </div>

      <div :class="$style.playList">
        <div v-if="listLoading" :class="$style.columnEmpty">読み込み中...</div>
        <div v-else-if="listError" :class="[$style.columnEmpty, $style.columnError]">{{ listError }}</div>
        <div v-else-if="listItems.length === 0" :class="$style.columnEmpty">Playが見つかりません</div>
        <button
          v-for="item in listItems"
          :key="item.id"
          class="_button"
          :class="$style.playCard"
          @click="openPlay(item.id)"
        >
          <div :class="$style.playCardTitle">{{ item.title }}</div>
          <div :class="$style.playCardMeta">
            <span :class="$style.playCardAuthor">@{{ item.user.username }}</span>
            <span v-if="item.likedCount > 0" :class="$style.playCardLikes">
              <i class="ti ti-heart" /> {{ item.likedCount }}
            </span>
          </div>
          <div v-if="item.summary" :class="$style.playCardSummary">{{ item.summary }}</div>
        </button>
      </div>
      </div>
    </template>

    <!-- Ready mode (before execution) -->
    <template v-else-if="mode === 'ready'">
      <div :class="$style.playReadyScroll">
        <div v-if="fetching" :class="$style.columnEmpty">Loading...</div>
        <div v-else-if="fetchError" :class="[$style.columnEmpty, $style.columnError]">{{ fetchError }}</div>
        <template v-else-if="flash">
          <div :class="$style.playReady">
            <div :class="$style.playReadyTitle">{{ flash.title }}</div>
            <div v-if="flash.summary" :class="$style.playReadySummary">{{ flash.summary }}</div>
            <button class="_button" :class="$style.playStartBtn" @click="startPlay">
              <i class="ti ti-player-play" /> Play
            </button>
            <div :class="$style.playReadyInfo">
              <i class="ti ti-heart" /> {{ flash.likedCount }}
            </div>
          </div>

          <div :class="$style.playFooter">
            <div :class="$style.playFooterAuthor">
              <img :src="flash.user.avatarUrl || '/avatar-default.svg'" :class="$style.playFooterAvatar" />
              By @{{ flash.user.username }}
            </div>
            <div :class="$style.playFooterDates">
              <div v-if="flash.createdAt !== flash.updatedAt">
                <i class="ti ti-clock" /> Updated: {{ flashUpdatedDate }}
              </div>
              <div>
                <i class="ti ti-clock" /> Created: {{ flashCreatedDate }}
              </div>
            </div>
          </div>
        </template>
      </div>
    </template>

    <!-- Started mode (executing / executed) -->
    <template v-else>
      <div :class="$style.playStartedScroll">
        <!-- UI output -->
        <div v-if="uiComponents.length" :class="$style.playUi">
          <AiScriptUiRenderer
            :components="uiComponents"
            :interpreter="(interpreter as Interpreter | null)"
            :server-url="serverUrl"
            @post="handlePost"
          />
        </div>

        <!-- Console output -->
        <div v-if="consoleOutput.length" :class="$style.playConsole">
          <div
            v-for="(line, i) in consoleOutput"
            :key="i"
            :class="[$style.consoleLine, { [$style.error]: line.isError }]"
          >
            {{ line.text }}
          </div>
        </div>

        <!-- Error -->
        <div v-if="runError" :class="$style.playError">{{ runError }}</div>

        <!-- Loading -->
        <div v-if="running && !uiComponents.length && !runError" :class="$style.columnEmpty">
          Running...
        </div>

        <!-- Actions -->
        <div v-if="!running" :class="$style.playActions">
          <div :class="$style.playActionsRow">
            <button class="_button" :class="$style.playActionBtn" title="Reload" @click="reload">
              <i class="ti ti-reload" />
            </button>
          </div>
          <div v-if="flash" :class="$style.playActionsRow">
            <button
              class="_button"
              :class="[$style.playActionBtn, { [$style.liked]: flash.isLiked }]"
              @click="toggleLike"
            >
              <i class="ti ti-heart" />
              {{ flash.likedCount }}
            </button>
          </div>
        </div>
      </div>
    </template>
  </DeckColumn>

  <Teleport v-if="showPostForm && props.column.accountId" to="body">
    <MkPostForm
      :account-id="props.column.accountId"
      :initial-text="postFormData.text"
      :initial-cw="postFormData.cw"
      :initial-visibility="postFormData.visibility"
      :initial-local-only="postFormData.localOnly"
      @close="closePostForm"
      @posted="closePostForm"
    />
  </Teleport>
</template>

<style lang="scss" module>
@use "./column-common.module.scss";

/* --- List mode --- */

.playListContent {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
}

.playTabs {
  display: flex;
  border-bottom: 1px solid var(--nd-divider);
  flex-shrink: 0;
}

.playTab {
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

.playList {
  flex: 1;
  overflow-y: auto;
  scrollbar-color: var(--nd-scrollbarHandle) transparent;
  scrollbar-width: thin;
}

.playCard {
  display: flex;
  flex-direction: column;
  gap: 4px;
  width: 100%;
  padding: 12px 14px;
  text-align: left;
  border-bottom: 1px solid var(--nd-divider);
  transition: background var(--nd-duration-base);

  &:hover {
    background: var(--nd-buttonHoverBg);
  }
}

.playCardTitle {
  font-size: 0.9em;
  font-weight: 600;
  color: var(--nd-fgHighlighted);
}

.playCardMeta {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 0.75em;
  opacity: 0.6;
}

.playCardAuthor {
  /* placeholder */
}

.playCardLikes {
  display: flex;
  align-items: center;
  gap: 2px;
}

.playCardSummary {
  font-size: 0.8em;
  opacity: 0.7;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

/* --- Ready mode --- */

.playReadyScroll {
  flex: 1;
  overflow-y: auto;
  scrollbar-color: var(--nd-scrollbarHandle) transparent;
  scrollbar-width: thin;
}

.playReady {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  padding: 28px 20px;
  margin: 12px;
  border-radius: 10px;
  background: var(--nd-panel);
}

.playReadyTitle {
  font-size: 1.2em;
  font-weight: bold;
  color: var(--nd-fgHighlighted);
  text-align: center;
}

.playReadySummary {
  font-size: 0.9em;
  text-align: center;
  opacity: 0.8;
  white-space: pre-wrap;
  line-height: 1.5;
}

.playStartBtn {
  display: flex;
  align-items: center;
  gap: 6px;
  margin: 8px 0;
  padding: 10px 32px;
  border-radius: var(--nd-radius-full);
  background: linear-gradient(90deg, var(--nd-accent), color-mix(in srgb, var(--nd-accent), #fff 20%));
  color: #fff;
  font-size: 1em;
  font-weight: bold;
  transition: opacity var(--nd-duration-base);

  &:hover {
    opacity: 0.85;
  }
}

.playReadyInfo {
  font-size: 0.85em;
  opacity: 0.6;
}

.playFooter {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px 20px;
  margin: 0 12px 12px;
}

.playFooterAuthor {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 0.85em;
  opacity: 0.7;
}

.playFooterAvatar {
  width: 20px;
  height: 20px;
  border-radius: 50%;
}

.playFooterDates {
  font-size: 0.75em;
  opacity: 0.5;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

/* --- Started mode --- */

.playStartedScroll {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow-y: auto;
  scrollbar-color: var(--nd-scrollbarHandle) transparent;
  scrollbar-width: thin;
}

.playUi {
  padding: 16px 12px;
}

.playConsole {
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

.playError {
  padding: 8px 10px;
  margin: 0 12px;
  border-radius: var(--nd-radius-sm);
  background: var(--nd-love-subtle);
  color: var(--nd-love);
  font-size: 0.8em;
  white-space: pre-wrap;
}

.playActions {
  margin-top: auto;
  border-top: 1px solid var(--nd-divider);
}

.playActionsRow {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 12px;
  padding: 10px 16px;
  border-bottom: 1px solid var(--nd-divider);

  &:last-child {
    border-bottom: none;
  }
}

.playActionBtn {
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
