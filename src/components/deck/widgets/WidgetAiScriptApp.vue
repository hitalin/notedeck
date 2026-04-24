<script setup lang="ts">
import { type Ast, Interpreter, Parser } from '@syuilo/aiscript'
import {
  computed,
  defineAsyncComponent,
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
import type { WidgetConfig } from '@/stores/deck'
import { useDeckStore } from '@/stores/deck'
import AiScriptEditor from './AiScriptEditor.vue'
import type { PostFormRequest } from './AiScriptUiRenderer.vue'
import AiScriptUiRenderer from './AiScriptUiRenderer.vue'
import { fetchWidgetCode, useWidgetTemplates } from './templates'

const props = defineProps<{
  widget: WidgetConfig
  columnId: string
  accountId: string | null
}>()

const deckStore = useDeckStore()
const commandStore = useCommandStore()
const accountsStore = useAccountsStore()
const serverUrl = computed(() => {
  if (!props.accountId) return ''
  const account = accountsStore.accounts.find((a) => a.id === props.accountId)
  return account ? `https://${account.host}` : ''
})
const code = ref((props.widget.data.code as string) ?? '')
const uiComponents = ref<UiComponent[]>([])
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

// Persist code on change
let saveTimer: ReturnType<typeof setTimeout> | null = null
watch(code, (val) => {
  if (saveTimer) clearTimeout(saveTimer)
  saveTimer = setTimeout(() => {
    deckStore.updateWidgetData(props.columnId, props.widget.id, { code: val })
  }, 500)
})

async function run() {
  if (running.value) return
  running.value = true
  error.value = null
  uiComponents.value = []

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
      storagePrefix: `app-${props.widget.id}`,
      onDialog: (title, text, type) =>
        dialogRef.value?.showDialog(title, text, type) ?? Promise.resolve(),
      onConfirm: (title, text) =>
        dialogRef.value?.showConfirm(title, text) ?? Promise.resolve(false),
      onToast: (text, type) => showToast(text, type),
    },
    {
      THIS_ID: props.widget.id,
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
    onOutput: () => {
      /* noop */
    },
    onError: (err) => {
      error.value = err.message
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

onMounted(() => {
  if (props.widget.data.autoRun && code.value) {
    deckStore.updateWidgetData(props.columnId, props.widget.id, {
      autoRun: false,
    })
    run()
  }
})
</script>

<template>
  <div :class="$style.widgetApp">
    <AiScriptDialog ref="dialogRef" />

    <div v-if="showTemplatePicker" :class="$style.templatePicker">
      <div :class="$style.templateHeader">テンプレートから作成</div>
      <div
        v-if="templatesLoading"
        :class="$style.templateItem"
        style="justify-content: center"
      >
        <i class="ti ti-loader" /> 読み込み中...
      </div>
      <div v-else-if="templatesError" :class="$style.templateErrorBox">
        <div>テンプレートを取得できませんでした</div>
        <button :class="$style.templateRetry" @click="retryLoadTemplates">
          <i class="ti ti-refresh" /> 再試行
        </button>
      </div>
      <template v-else>
        <button
          v-for="tmpl in widgetTemplates"
          :key="tmpl.id"
          :class="$style.templateItem"
          :title="tmpl.description"
          :disabled="applyingTemplateId !== null"
          @click="applyTemplate(tmpl.id)"
        >
          <i :class="applyingTemplateId === tmpl.id ? 'ti ti-loader' : 'ti ' + tmpl.icon" />
          {{ tmpl.label }}
        </button>
      </template>
      <button :class="[$style.templateItem, $style.templateSkip]" @click="skipTemplate">
        空のエディタで始める
      </button>
    </div>

    <template v-else>
      <div :class="$style.appToolbar">
        <button :class="$style.toolBtn" @click="showEditor = !showEditor">
          <i :class="showEditor ? 'ti ti-chevron-up' : 'ti ti-code'" />
        </button>
        <button :class="[$style.toolBtn, $style.run]" :disabled="running" @click="run">
          <i class="ti ti-player-play" />
        </button>
      </div>

      <AiScriptEditor
        v-if="showEditor"
        v-model="code"
        placeholder="AiScript App code..."
      />

      <div v-if="error" :class="$style.appError">{{ error }}</div>

      <AiScriptUiRenderer
        v-if="uiComponents.length"
        :components="uiComponents"
        :interpreter="(interpreter as Interpreter | null)"
        :server-url="serverUrl"
        @post="handlePost"
      />
    </template>
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
  gap: 6px;
}

.appToolbar {
  display: flex;
  justify-content: flex-end;
  gap: 4px;
}

.toolBtn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
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
}

.templateHeader {
  padding: 4px 4px 2px;
  font-size: 0.75em;
  font-weight: 600;
  opacity: 0.45;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.templateItem {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  border: none;
  border-radius: var(--nd-radius-sm);
  background: var(--nd-buttonBg);
  color: var(--nd-fg);
  cursor: pointer;
  font-size: 0.85em;
  text-align: left;
  transition: background var(--nd-duration-base);

  &:hover {
    background: var(--nd-buttonHoverBg);
  }

  &.templateSkip {
    justify-content: center;
    opacity: 0.5;
    margin-top: 4px;
  }
}

// Keep for dynamic binding
.templateSkip {}

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
</style>
