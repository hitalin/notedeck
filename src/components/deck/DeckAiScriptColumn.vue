<script setup lang="ts">
import { type Ast, Interpreter, Parser } from '@syuilo/aiscript'
import { invoke } from '@tauri-apps/api/core'
import { computed, onUnmounted, ref, watch } from 'vue'
import { createAiScriptEnv } from '@/aiscript/api'
import { createInterpreterOptions } from '@/aiscript/common'
import { cleanupNoteDeckEnv, createNoteDeckEnv } from '@/aiscript/notedeck-api'
import { sanitizeCode } from '@/aiscript/sanitize'
import { createAiScriptUiLib, type UiComponent } from '@/aiscript/ui'
import { useCommandStore } from '@/commands/registry'
import AiScriptDialog from '@/components/common/AiScriptDialog.vue'
import AiScriptToast from '@/components/common/AiScriptToast.vue'
import { useAccountsStore } from '@/stores/accounts'
import type { DeckColumn as DeckColumnType } from '@/stores/deck'
import { useDeckStore } from '@/stores/deck'
import { useThemeStore } from '@/stores/theme'
import DeckColumn from './DeckColumn.vue'
import AiScriptEditor from './widgets/AiScriptEditor.vue'
import AiScriptUiRenderer from './widgets/AiScriptUiRenderer.vue'

const props = defineProps<{
  column: DeckColumnType
}>()

const deckStore = useDeckStore()
const commandStore = useCommandStore()
const accountsStore = useAccountsStore()
const themeStore = useThemeStore()

const columnThemeVars = computed(() => {
  const accountId = props.column.accountId
  if (!accountId) return undefined
  return themeStore.getStyleVarsForAccount(accountId)
})

const serverUrl = computed(() => {
  if (!props.column.accountId) return ''
  const account = accountsStore.accounts.find(
    (a) => a.id === props.column.accountId,
  )
  return account ? `https://${account.host}` : ''
})

const code = ref(props.column.aiscriptCode ?? '<: "Hello, AiScript!"')
const output = ref<{ text: string; isError: boolean }[]>([])
const uiComponents = ref<UiComponent[]>([])
const error = ref<string | null>(null)
const running = ref(false)
const interpreter = ref<Interpreter | null>(null)
const toastRef = ref<InstanceType<typeof AiScriptToast> | null>(null)
const dialogRef = ref<InstanceType<typeof AiScriptDialog> | null>(null)
let currentNdCtx: Parameters<typeof cleanupNoteDeckEnv>[0] | null = null

// Split ratio (editor height fraction)
const editorRatio = ref(0.6)
const bodyRef = ref<HTMLElement>()

// Persist code on change
let saveTimer: ReturnType<typeof setTimeout> | null = null
watch(code, (val) => {
  if (saveTimer) clearTimeout(saveTimer)
  saveTimer = setTimeout(() => {
    deckStore.updateColumn(props.column.id, { aiscriptCode: val })
  }, 500)
})

async function run() {
  if (running.value) return
  running.value = true
  error.value = null
  output.value = []
  uiComponents.value = []

  const apiOption = props.column.accountId
    ? async (endpoint: string, params: Record<string, unknown>) => {
        return invoke('api_request', {
          accountId: props.column.accountId,
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
      storagePrefix: `col-aiscript-${props.column.id}`,
      onDialog: (title, text, type) =>
        dialogRef.value?.showDialog(title, text, type) ?? Promise.resolve(),
      onConfirm: (title, text) =>
        dialogRef.value?.showConfirm(title, text) ?? Promise.resolve(false),
      onToast: (text, type) => toastRef.value?.show(text, type),
    },
    {
      THIS_ID: props.column.id,
      THIS_URL: '',
      USER_ID: props.column.accountId ?? '',
      USER_NAME: '',
      USER_USERNAME: '',
      LOCALE: navigator.language,
      SERVER_URL: serverUrl.value,
    },
  )

  const ndCtx = {
    deckStore,
    commandStore,
    registeredCommandIds: [] as string[],
  }
  const ndEnv = createNoteDeckEnv(ndCtx)

  const ui = createAiScriptUiLib({
    onRender: (components) => {
      uiComponents.value = components
    },
  })

  const ioOpts = createInterpreterOptions({
    onOutput: (text) => output.value.push({ text, isError: false }),
    onError: (err) => {
      error.value = err.message
    },
  })

  // Cleanup previous run's commands
  if (currentNdCtx) cleanupNoteDeckEnv(currentNdCtx)
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

// Vertical resize
let resizing = false

function startResize(e: MouseEvent) {
  e.preventDefault()
  resizing = true
  document.body.style.userSelect = 'none'
  document.body.style.cursor = 'row-resize'
  document.addEventListener('mousemove', onResize)
  document.addEventListener('mouseup', stopResize)
}

function onResize(e: MouseEvent) {
  if (!resizing || !bodyRef.value) return
  const rect = bodyRef.value.getBoundingClientRect()
  const ratio = (e.clientY - rect.top) / rect.height
  editorRatio.value = Math.max(0.15, Math.min(0.85, ratio))
}

function stopResize() {
  resizing = false
  document.body.style.userSelect = ''
  document.body.style.cursor = ''
  document.removeEventListener('mousemove', onResize)
  document.removeEventListener('mouseup', stopResize)
}

function onKeydown(e: KeyboardEvent) {
  if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
    e.preventDefault()
    run()
  }
}

onUnmounted(() => {
  if (saveTimer) clearTimeout(saveTimer)
  if (resizing) stopResize()
  if (currentNdCtx) cleanupNoteDeckEnv(currentNdCtx)
})
</script>

<template>
  <DeckColumn :column-id="column.id" :title="column.name ?? 'AiScript'" :theme-vars="columnThemeVars">
    <template #header-icon>
      <i class="ti ti-code tl-header-icon" />
    </template>

    <template #header-meta>
      <button
        class="_button header-run-btn"
        :class="{ running }"
        :disabled="running"
        title="Run (Ctrl+Enter)"
        @click.stop="run"
      >
        <i class="ti ti-player-play" />
      </button>
    </template>

    <AiScriptToast ref="toastRef" />
    <AiScriptDialog ref="dialogRef" />
    <div ref="bodyRef" class="ais-col-body" @keydown="onKeydown">
      <div
        class="editor-panel"
        :style="{ flex: `${editorRatio} 0 0` }"
      >
        <AiScriptEditor
          v-model="code"
          placeholder="AiScript..."
          max-height="none"
          use-lsp
        />
      </div>

      <div class="resize-handle" @mousedown="startResize">
        <div class="resize-grip" />
      </div>

      <div
        class="output-panel"
        :style="{ flex: `${1 - editorRatio} 0 0` }"
      >
        <div v-if="error" class="output-error">{{ error }}</div>

        <AiScriptUiRenderer
          v-if="uiComponents.length"
          :components="uiComponents"
          :interpreter="(interpreter as Interpreter | null)"
          :server-url="serverUrl"
        />

        <div v-if="output.length" class="console-output">
          <div
            v-for="(line, i) in output"
            :key="i"
            class="output-line"
            :class="{ error: line.isError }"
          >
            {{ line.text }}
          </div>
        </div>

        <div
          v-if="!error && !output.length && !uiComponents.length"
          class="output-empty"
        >
          Ctrl+Enter to run
        </div>
      </div>
    </div>
  </DeckColumn>
</template>

<style scoped>
.header-run-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border-radius: 6px;
  background: var(--nd-accent);
  color: var(--nd-fgOnAccent);
  font-size: 0.85em;
  transition: background 0.15s, opacity 0.15s;
}

.header-run-btn:hover:not(:disabled) {
  background: var(--nd-accentDarken);
}

.header-run-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.header-run-btn.running i {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

.ais-col-body {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
  overflow: hidden;
}

.editor-panel {
  display: flex;
  flex-direction: column;
  min-height: 0;
  overflow: hidden;
}

.resize-handle {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 8px;
  cursor: row-resize;
  background: var(--nd-bg);
  border-top: 1px solid var(--nd-divider);
  border-bottom: 1px solid var(--nd-divider);
  flex-shrink: 0;
}

.resize-grip {
  width: 32px;
  height: 3px;
  border-radius: 2px;
  background: var(--nd-divider);
  transition: background 0.15s;
}

.resize-handle:hover .resize-grip {
  background: var(--nd-accent);
}

.output-panel {
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-height: 0;
  overflow-y: auto;
  padding: 10px;
}

.output-error {
  padding: 6px 8px;
  border-radius: 6px;
  background: rgba(221, 46, 68, 0.1);
  color: var(--nd-love);
  font-size: 0.8em;
  white-space: pre-wrap;
}

.console-output {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.output-line {
  font-family: 'Fira Code', 'Cascadia Code', 'Consolas', monospace;
  font-size: 0.8em;
  line-height: 1.5;
  white-space: pre-wrap;
  word-break: break-all;
}

.output-line.error {
  color: var(--nd-love);
}

.output-empty {
  display: flex;
  align-items: center;
  justify-content: center;
  flex: 1;
  opacity: 0.3;
  font-size: 0.85em;
}
</style>
