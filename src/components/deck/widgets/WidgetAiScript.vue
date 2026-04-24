<script setup lang="ts">
import { type Ast, Interpreter, Parser } from '@syuilo/aiscript'
import {
  computed,
  defineAsyncComponent,
  onBeforeUnmount,
  onMounted,
  ref,
  useTemplateRef,
  watch,
} from 'vue'
import { createAiScriptEnv } from '@/aiscript/api'
import { createInterpreterOptions } from '@/aiscript/common'
import {
  cleanupNoteDeckEnv,
  createNoteDeckEnv,
  type NoteDeckEnvContext,
} from '@/aiscript/notedeck-api'
import { sanitizeCode } from '@/aiscript/sanitize'
import { createAiScriptUiLib, type UiComponent } from '@/aiscript/ui'
import type { JsonValue } from '@/bindings'
import { useCommandStore } from '@/commands/registry'
import AiScriptDialog from '@/components/common/AiScriptDialog.vue'
import { usePortal } from '@/composables/usePortal'
import { useToast } from '@/stores/toast'
import { commands, unwrap } from '@/utils/tauriInvoke'

const MkPostForm = defineAsyncComponent(
  () => import('@/components/common/MkPostForm.vue'),
)

import { useAccountsStore } from '@/stores/accounts'
import { useDeckStore } from '@/stores/deck'
import { getWidgetDetailUrl } from '@/stores/misstore'
import { useWidgetsStore, type WidgetMeta } from '@/stores/widgets'
import { openSafeUrl } from '@/utils/url'
import AiScriptEditor from './AiScriptEditor.vue'
import type { PostFormRequest } from './AiScriptUiRenderer.vue'
import AiScriptUiRenderer from './AiScriptUiRenderer.vue'
import { checkWidgetCapabilities } from './capabilities'
import { fetchWidgetCode, useWidgetTemplates } from './templates'

const props = defineProps<{
  widget: WidgetMeta
  columnId: string
  accountId: string | null
  isSidebar?: boolean
}>()

const emit = defineEmits<{
  remove: []
}>()

const deckStore = useDeckStore()
const widgetsStore = useWidgetsStore()

const displayName = computed(() => {
  const name = props.widget.name?.trim()
  if (!name || /^Widget [0-9a-z]{4,}$/i.test(name)) return 'AiScript'
  return name
})
const commandStore = useCommandStore()
const accountsStore = useAccountsStore()
const serverUrl = computed(() => {
  if (!props.accountId) return ''
  const account = accountsStore.accounts.find((a) => a.id === props.accountId)
  return account ? `https://${account.host}` : ''
})
const code = ref(props.widget.src ?? '')
const uiComponents = ref<UiComponent[]>([])
const output = ref<{ text: string; isError: boolean }[]>([])
const error = ref<string | null>(null)
const running = ref(false)
const showEditor = ref(!code.value)
const showTemplatePicker = ref(!code.value)

const {
  templates: widgetTemplates,
  loading: templatesLoading,
  error: templatesError,
} = useWidgetTemplates()
const applyingTemplateId = ref<string | null>(null)

const templateCompat = computed(() =>
  Object.fromEntries(
    widgetTemplates.value.map((t) => [
      t.id,
      checkWidgetCapabilities(t.capabilities, { accountId: props.accountId }),
    ]),
  ),
)

const templateQuery = ref('')
const filteredTemplates = computed(() => {
  const q = templateQuery.value.trim().toLowerCase()
  if (!q) return widgetTemplates.value
  return widgetTemplates.value.filter((t) => {
    const haystack = [
      t.label,
      t.description,
      t.entry.author,
      ...t.entry.tags,
      ...t.capabilities,
    ]
      .join(' ')
      .toLowerCase()
    return haystack.includes(q)
  })
})

async function retryLoadTemplates() {
  const { useMisStoreStore } = await import('@/stores/misstore')
  useMisStoreStore().refreshWidgets()
}

async function applyTemplate(templateId: string) {
  const tmpl = widgetTemplates.value.find((t) => t.id === templateId)
  if (!tmpl) return
  applyingTemplateId.value = templateId
  try {
    code.value = await fetchWidgetCode(tmpl)
    widgetsStore.setStoreId(props.widget.installId, tmpl.id)
    widgetsStore.setAutoRun(props.widget.installId, tmpl.autoRun)
    widgetsStore.renameWidget(props.widget.installId, tmpl.label)
    // debounce を介さず即座にソースを保存 (適用直後にカラム閉じても消えないように)
    flushPendingSave()
    widgetsStore.updateSrc(props.widget.installId, code.value)
    showTemplatePicker.value = false
    showEditor.value = false
    if (tmpl.autoRun) run()
  } catch (e) {
    error.value =
      e instanceof Error ? e.message : 'テンプレートの取得に失敗しました'
  } finally {
    applyingTemplateId.value = null
  }
}

function skipTemplate() {
  showTemplatePicker.value = false
  showEditor.value = true
}
const interpreter = ref<Interpreter | null>(null)
const { show: showToast } = useToast()
const dialogRef = ref<InstanceType<typeof AiScriptDialog> | null>(null)
let currentNdCtx: Parameters<typeof cleanupNoteDeckEnv>[0] | null = null

const postFormPortalRef = useTemplateRef<HTMLElement>('postFormPortalRef')
usePortal(postFormPortalRef)

const showPostForm = ref(false)
const postFormData = ref<PostFormRequest>({})

function handlePost(form: PostFormRequest) {
  if (!props.accountId) return
  postFormData.value = form
  showPostForm.value = true
}

function closePostForm() {
  showPostForm.value = false
  postFormData.value = {}
}

// Persist code on change (debounce + アンマウント時 flush で取りこぼし防止)
let saveTimer: ReturnType<typeof setTimeout> | null = null
function flushPendingSave() {
  if (saveTimer) {
    clearTimeout(saveTimer)
    saveTimer = null
    widgetsStore.updateSrc(props.widget.installId, code.value)
  }
}
watch(code, (val) => {
  if (saveTimer) clearTimeout(saveTimer)
  saveTimer = setTimeout(() => {
    saveTimer = null
    widgetsStore.updateSrc(props.widget.installId, val)
  }, 500)
})

onBeforeUnmount(flushPendingSave)

async function run() {
  if (running.value) return
  running.value = true
  error.value = null
  uiComponents.value = []
  output.value = []

  const accId = props.accountId
  const apiOption = accId
    ? async (endpoint: string, params: Record<string, unknown>) => {
        return unwrap(
          await commands.apiRequest(accId, endpoint, params as JsonValue),
        )
      }
    : undefined

  const parser = new Parser()
  let ast: Ast.Node[]
  try {
    ast = parser.parse(sanitizeCode(code.value))
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e)
    running.value = false
    return
  }

  const env = createAiScriptEnv(
    {
      api: apiOption,
      storagePrefix: `app-${props.widget.installId}`,
      onDialog: (title, text, type) =>
        dialogRef.value?.showDialog(title, text, type) ?? Promise.resolve(),
      onConfirm: (title, text) =>
        dialogRef.value?.showConfirm(title, text) ?? Promise.resolve(false),
      onToast: (text, type) => showToast(text, type),
    },
    {
      THIS_ID: props.widget.installId,
      THIS_URL: '',
      USER_ID:
        accountsStore.accounts.find((a) => a.id === props.accountId)?.userId ??
        '',
      USER_NAME: '',
      USER_USERNAME: '',
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
    onOutput: (text) => {
      output.value.push({ text, isError: false })
    },
    onError: (err) => {
      error.value = err.message
      output.value.push({ text: err.message, isError: true })
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

  const interp = new Interpreter({ ...env, ...ndEnv, ...ui }, ioOpts)
  ndCtx.interpreter = interp
  interpreter.value = interp

  try {
    await interp.exec(ast)
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e)
  }

  running.value = false
}

// autoRun=true な widget は mount のたびに自動実行する。
// (フラグを下げない: カラム再表示・ナビバートグル・他カラム参照のたびに UI を出すため)
onMounted(() => {
  if (props.widget.autoRun && code.value) {
    run()
  }
})
</script>

<template>
  <div :class="$style.widgetApp">
    <div :class="$style.widgetHeader">
      <span :class="$style.widgetLabel" :title="displayName">
        <i class="ti ti-apps" />
        <span :class="$style.widgetLabelText">{{ displayName }}</span>
      </span>
      <div v-if="!showTemplatePicker" :class="$style.headerActions">
        <button
          :class="$style.toolBtn"
          :title="showEditor ? 'エディタを閉じる' : 'コードを編集'"
          @click="showEditor = !showEditor"
        >
          <i :class="showEditor ? 'ti ti-chevron-up' : 'ti ti-code'" />
        </button>
        <button
          :class="[$style.toolBtn, $style.run]"
          :disabled="running"
          title="実行"
          @click="run"
        >
          <i class="ti ti-player-play" />
        </button>
      </div>
      <button
        :class="$style.widgetRemove"
        :title="isSidebar ? 'widget を削除 (コードも消えます)' : 'このカラムから外す (widget 本体は保持)'"
        @click="emit('remove')"
      >
        <i class="ti ti-x" />
      </button>
    </div>

    <div :class="$style.widgetBody">
      <AiScriptDialog ref="dialogRef" />

      <div v-if="showTemplatePicker" :class="$style.templatePicker">
      <button :class="$style.templateSkip" @click="skipTemplate">
        空のエディタで始める
      </button>
      <div :class="$style.searchWrap">
        <input
          v-model="templateQuery"
          :class="$style.searchInput"
          type="text"
          placeholder="ストアを検索..."
        />
      </div>
      <div v-if="templatesLoading" :class="$style.templateStatusRow">
        <i class="ti ti-loader nd-spin" /> 読み込み中...
      </div>
      <div v-else-if="templatesError" :class="$style.templateErrorBox">
        <div>テンプレートを取得できませんでした</div>
        <button :class="$style.templateRetry" @click="retryLoadTemplates">
          <i class="ti ti-refresh" /> 再試行
        </button>
      </div>
      <template v-else>
        <div
          v-if="filteredTemplates.length === 0"
          :class="$style.templateStatusRow"
        >
          一致するウィジェットがありません
        </div>
        <button
          v-for="tmpl in filteredTemplates"
          :key="tmpl.id"
          :class="[
            $style.card,
            { [$style.cardDisabled]: !templateCompat[tmpl.id]?.ok },
          ]"
          :title="
            templateCompat[tmpl.id]?.ok
              ? tmpl.description
              : templateCompat[tmpl.id]?.reason ?? tmpl.description
          "
          :disabled="
            applyingTemplateId !== null || !templateCompat[tmpl.id]?.ok
          "
          @click="applyTemplate(tmpl.id)"
        >
          <div :class="$style.accentBar" />
          <div :class="$style.icon">
            <i v-if="applyingTemplateId === tmpl.id" class="ti ti-loader nd-spin" />
            <i v-else class="ti ti-layout-dashboard" />
          </div>
          <div :class="$style.body">
            <div :class="$style.row1">
              <span :class="$style.name">{{ tmpl.label }}</span>
              <span :class="$style.spacer" />
              <span :class="$style.version">v{{ tmpl.entry.version }}</span>
            </div>
            <div :class="$style.row2">
              {{ tmpl.description || 'No description' }}
            </div>
            <div :class="$style.row3">
              <span v-if="tmpl.entry.author" :class="$style.author">
                {{ tmpl.entry.author }}
              </span>
              <span
                v-for="cap in tmpl.capabilities"
                :key="cap"
                :class="[
                  $style.capBadge,
                  { [$style.capBadgeWarn]: !templateCompat[tmpl.id]?.ok },
                ]"
              >
                {{ cap }}
              </span>
              <span :class="$style.spacer" />
              <span
                :class="$style.iconBtn"
                title="MisStore で詳細を開く"
                role="button"
                tabindex="0"
                @click.stop="openSafeUrl(getWidgetDetailUrl(tmpl.id))"
                @keydown.enter.stop.prevent="openSafeUrl(getWidgetDetailUrl(tmpl.id))"
              >
                <i class="ti ti-external-link" />
              </span>
            </div>
          </div>
        </button>
      </template>
    </div>

      <template v-else>
        <AiScriptEditor
          v-if="showEditor"
          v-model="code"
          placeholder="AiScript App code..."
        />

        <template v-else>
          <div v-if="error" :class="$style.appError">{{ error }}</div>

          <AiScriptUiRenderer
            v-if="uiComponents.length"
            :components="uiComponents"
            :interpreter="(interpreter as Interpreter | null)"
            :server-url="serverUrl"
            @post="handlePost"
          />

          <details v-if="output.length" :class="$style.outputPanel">
            <summary>出力 ({{ output.length }})</summary>
            <div
              v-for="(line, i) in output"
              :key="i"
              :class="[$style.outputLine, { [$style.error]: line.isError }]"
            >
              {{ line.text }}
            </div>
          </details>
        </template>
      </template>
    </div>
  </div>

  <div v-if="showPostForm && props.accountId" ref="postFormPortalRef">
    <MkPostForm
      :account-id="props.accountId"
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
.widgetApp {
  display: flex;
  flex-direction: column;
}

.widgetHeader {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 6px 10px;
  border-bottom: 1px solid var(--nd-divider);
  font-size: 0.85em;
  background: var(--nd-panelHeaderBg);
  color: var(--nd-panelHeaderFg);
}

.widgetLabel {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-right: auto;
  min-width: 0;
  font-weight: 500;
  opacity: 0.8;
}

.widgetLabelText {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  min-width: 0;
}

.headerActions {
  display: flex;
  align-items: center;
  gap: 4px;
}

.widgetRemove {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border: none;
  background: none;
  color: var(--nd-fg);
  cursor: pointer;
  border-radius: var(--nd-radius-sm);
  opacity: 0.35;
  transition: opacity var(--nd-duration-base), background var(--nd-duration-base);

  &:hover {
    opacity: 1;
    color: var(--nd-love);
    background: var(--nd-love-subtle);
  }
}

.widgetBody {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 10px;
}

.toolBtn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border: none;
  border-radius: var(--nd-radius-sm);
  background: var(--nd-buttonBg);
  color: var(--nd-fg);
  cursor: pointer;
  font-size: 0.85em;
  opacity: 0.6;
  transition: opacity var(--nd-duration-base), background var(--nd-duration-base);

  &:hover {
    opacity: 1;
    background: var(--nd-buttonHoverBg);
  }

  &.run {
    background: var(--nd-accent);
    color: var(--nd-fgOnAccent);
    opacity: 1;

    &:hover:not(:disabled) {
      background: var(--nd-accentDarken);
    }

    &:disabled {
      opacity: 0.4;
      cursor: not-allowed;
    }
  }
}

.appError {
  padding: 6px 8px;
  border-radius: var(--nd-radius-sm);
  background: var(--nd-love-subtle);
  color: var(--nd-love);
  font-size: 0.8em;
  white-space: pre-wrap;
}

// Keep for dynamic binding
.run {}

.templatePicker {
  display: flex;
  flex-direction: column;
  gap: 4px;
  max-height: 480px;
  overflow-y: auto;
}

.searchWrap {
  display: flex;
  align-items: center;
  padding: 6px 4px 4px;
  width: 100%;
  position: sticky;
  top: 0;
  background: var(--nd-panel);
  z-index: 1;
}

.searchInput {
  flex: 1;
  min-width: 0;
  height: 26px;
  padding: 0 6px;
  border: 1px solid var(--nd-divider);
  border-radius: 2px;
  background: var(--nd-inputBg, var(--nd-bg));
  color: var(--nd-fg);
  font-size: 12px;

  &::placeholder {
    color: var(--nd-fg);
    opacity: 0.4;
  }

  &:focus {
    outline: none;
    border-color: var(--nd-accent);
  }
}

.card {
  position: relative;
  display: flex;
  gap: 12px;
  padding: 12px 14px 12px 16px;
  border: none;
  background: transparent;
  color: var(--nd-fg);
  cursor: pointer;
  text-align: left;
  width: 100%;
  transition: background var(--nd-duration-fast);

  &:hover:not(:disabled) {
    background: var(--nd-buttonHoverBg);

    .accentBar {
      opacity: 1;
    }
  }

  & + & {
    border-top: 1px solid color-mix(in srgb, var(--nd-divider) 50%, transparent);
  }

  &:disabled {
    cursor: not-allowed;
  }

  &.cardDisabled {
    opacity: 0.5;
  }
}

.accentBar {
  position: absolute;
  top: 8px;
  bottom: 8px;
  left: 0;
  width: 2px;
  background: var(--nd-accent);
  border-radius: 0 2px 2px 0;
  opacity: 0;
  transition: opacity var(--nd-duration-base);
}

.icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 48px;
  height: 48px;
  flex-shrink: 0;
  color: var(--nd-accent);
  font-size: 32px;
  line-height: 1;
}

.body {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.row1 {
  display: flex;
  align-items: baseline;
  gap: 6px;
  min-width: 0;
}

.name {
  font-size: 13px;
  font-weight: 600;
  color: var(--nd-fgHighlighted);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  min-width: 0;
  flex-shrink: 1;
}

.version {
  font-size: 11px;
  color: var(--nd-fg);
  opacity: 0.45;
  flex-shrink: 0;
  font-variant-numeric: tabular-nums;
}

.row2 {
  font-size: 12px;
  color: var(--nd-fg);
  opacity: 0.7;
  overflow: hidden;
  text-overflow: ellipsis;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  line-clamp: 2;
  -webkit-box-orient: vertical;
  line-height: 1.4;
  margin-top: 1px;
}

.row3 {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 4px;
  margin-top: 4px;
  min-width: 0;
  min-height: 18px;
}

.author {
  font-size: 11px;
  color: var(--nd-fg);
  opacity: 0.55;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  flex-shrink: 1;
  min-width: 0;
  margin-right: 4px;
}

.capBadge {
  font-size: 10px;
  padding: 1px 6px;
  border-radius: 8px;
  background: color-mix(in srgb, var(--nd-fg) 8%, transparent);
  color: var(--nd-fg);
  opacity: 0.6;
  flex-shrink: 0;
  line-height: 1.3;
  font-family: 'Fira Code', 'Cascadia Code', 'Consolas', monospace;

  &.capBadgeWarn {
    background: var(--nd-love-subtle);
    color: var(--nd-love);
    opacity: 1;
  }
}

.spacer {
  flex: 1;
  min-width: 4px;
}

.iconBtn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  flex-shrink: 0;
  border-radius: 3px;
  color: var(--nd-fg);
  font-size: 13px;
  opacity: 0.55;
  cursor: pointer;
  transition:
    background var(--nd-duration-fast),
    opacity var(--nd-duration-fast);

  &:hover {
    opacity: 1;
    background: var(--nd-buttonHoverBg);
  }
}

.templateStatusRow {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 10px;
  color: var(--nd-fg);
  opacity: 0.6;
  font-size: 0.85em;
}

.templateSkip {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 8px 10px;
  border: none;
  border-radius: var(--nd-radius-sm);
  background: var(--nd-buttonBg);
  color: var(--nd-fg);
  cursor: pointer;
  font-size: 0.85em;
  opacity: 0.5;
  transition: background var(--nd-duration-base);

  &:hover {
    background: var(--nd-buttonHoverBg);
  }
}

// Keep for dynamic binding
.cardDisabled {}
.capBadgeWarn {}

.templateErrorBox {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 10px;
  border-radius: var(--nd-radius-sm);
  background: var(--nd-love-subtle);
  color: var(--nd-love);
  font-size: 0.8em;
  text-align: center;
}

.templateRetry {
  align-self: center;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 4px 10px;
  border: none;
  border-radius: var(--nd-radius-sm);
  background: var(--nd-buttonBg);
  color: var(--nd-fg);
  cursor: pointer;
  font-size: 0.9em;

  &:hover {
    background: var(--nd-buttonHoverBg);
  }
}

.outputPanel {
  padding: 6px 10px;
  border-radius: var(--nd-radius-sm);
  background: var(--nd-bg);
  font-family: 'Fira Code', 'Cascadia Code', 'Consolas', monospace;
  font-size: 0.8em;
  line-height: 1.6;
  max-height: 200px;
  overflow-y: auto;

  summary {
    cursor: pointer;
    opacity: 0.6;
    font-size: 0.9em;
    user-select: none;
  }
}

.outputLine {
  white-space: pre-wrap;
  word-break: break-all;

  &.error {
    color: var(--nd-love);
  }
}

// Keep for dynamic binding
.error {}
</style>
