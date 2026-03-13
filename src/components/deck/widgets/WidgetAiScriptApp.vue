<script setup lang="ts">
import { type Ast, Interpreter, Parser } from '@syuilo/aiscript'
import { invoke } from '@tauri-apps/api/core'
import { computed, defineAsyncComponent, onMounted, ref, watch } from 'vue'
import { createAiScriptEnv } from '@/aiscript/api'
import { createInterpreterOptions } from '@/aiscript/common'
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

const MkPostForm = defineAsyncComponent(
  () => import('@/components/common/MkPostForm.vue'),
)

import { useAccountsStore } from '@/stores/accounts'
import type { WidgetConfig } from '@/stores/deck'
import { useDeckStore } from '@/stores/deck'
import AiScriptEditor from './AiScriptEditor.vue'
import type { PostFormRequest } from './AiScriptUiRenderer.vue'
import AiScriptUiRenderer from './AiScriptUiRenderer.vue'

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
const interpreter = ref<Interpreter | null>(null)
const toastRef = ref<InstanceType<typeof AiScriptToast> | null>(null)
const dialogRef = ref<InstanceType<typeof AiScriptDialog> | null>(null)
let currentNdCtx: Parameters<typeof cleanupNoteDeckEnv>[0] | null = null

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

  const apiOption = props.accountId
    ? async (endpoint: string, params: Record<string, unknown>) => {
        return invoke('api_request', {
          accountId: props.accountId,
          endpoint,
          params,
        })
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
      onToast: (text, type) => toastRef.value?.show(text, type),
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
    onOutput: () => {},
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
  <div class="widget-app">
    <AiScriptToast ref="toastRef" />
    <AiScriptDialog ref="dialogRef" />
    <div class="app-toolbar">
      <button class="tool-btn" @click="showEditor = !showEditor">
        <i :class="showEditor ? 'ti ti-chevron-up' : 'ti ti-code'" />
      </button>
      <button class="tool-btn run" :disabled="running" @click="run">
        <i class="ti ti-player-play" />
      </button>
    </div>

    <AiScriptEditor
      v-if="showEditor"
      v-model="code"
      placeholder="AiScript App code..."
    />

    <div v-if="error" class="app-error">{{ error }}</div>

    <AiScriptUiRenderer
      v-if="uiComponents.length"
      :components="uiComponents"
      :interpreter="(interpreter as Interpreter | null)"
      :server-url="serverUrl"
      @post="handlePost"
    />
  </div>

  <Teleport v-if="showPostForm && props.accountId" to="body">
    <MkPostForm
      :account-id="props.accountId"
      :initial-text="postFormData.text"
      :initial-cw="postFormData.cw"
      :initial-visibility="postFormData.visibility"
      :initial-local-only="postFormData.localOnly"
      @close="closePostForm"
      @posted="closePostForm"
    />
  </Teleport>
</template>

<style scoped>
.widget-app {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.app-toolbar {
  display: flex;
  justify-content: flex-end;
  gap: 4px;
}

.tool-btn {
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
}

.tool-btn:hover {
  opacity: 1;
  background: var(--nd-buttonHoverBg);
}

.tool-btn.run {
  background: var(--nd-accent);
  color: var(--nd-fgOnAccent);
  opacity: 1;
}

.tool-btn.run:hover:not(:disabled) {
  background: var(--nd-accentDarken);
}

.tool-btn.run:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.app-error {
  padding: 6px 8px;
  border-radius: var(--nd-radius-sm);
  background: var(--nd-love-subtle);
  color: var(--nd-love);
  font-size: 0.8em;
  white-space: pre-wrap;
}
</style>
