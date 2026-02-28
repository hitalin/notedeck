<script setup lang="ts">
import type { Interpreter } from '@syuilo/aiscript'
import { type Ast, Parser } from '@syuilo/aiscript'
import { invoke } from '@tauri-apps/api/core'
import { computed, ref, watch } from 'vue'
import { createInterpreter, executeAiScript } from '@/aiscript/execute'
import { sanitizeCode } from '@/aiscript/sanitize'
import type { UiComponent } from '@/aiscript/ui-types'
import { useAccountsStore } from '@/stores/accounts'
import type { WidgetConfig } from '@/stores/deck'
import { useDeckStore } from '@/stores/deck'
import AiScriptEditor from './AiScriptEditor.vue'
import AiScriptUiRenderer from './AiScriptUiRenderer.vue'

const props = defineProps<{
  widget: WidgetConfig
  columnId: string
  accountId: string | null
}>()

const deckStore = useDeckStore()
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

  const options = {
    onOutput: () => {},
    onError: (err: Error) => {
      error.value = err.message
    },
    onUiRender: (components: UiComponent[]) => {
      uiComponents.value = components
    },
    api: apiOption,
    storagePrefix: `app-${props.widget.id}`,
    playVariables: {
      THIS_ID: props.widget.id,
      THIS_URL: '',
      USER_ID: props.accountId ?? '',
      USER_NAME: '',
      USER_USERNAME: '',
      LOCALE: navigator.language,
      SERVER_URL: serverUrl.value,
    },
  }

  // Create interpreter and keep reference for event handlers
  const parser = new Parser()
  let ast: Ast.Node[]
  try {
    ast = parser.parse(sanitizeCode(code.value))
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e)
    running.value = false
    return
  }

  const interp = createInterpreter(options)
  interpreter.value = interp
  try {
    await interp.exec(ast)
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e)
  }

  running.value = false
}
</script>

<template>
  <div class="widget-app">
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
      :interpreter="interpreter"
      :server-url="serverUrl"
    />
  </div>
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
  border-radius: 6px;
  background: var(--nd-buttonBg);
  color: var(--nd-fg);
  cursor: pointer;
  font-size: 0.85em;
  opacity: 0.6;
  transition: opacity 0.15s, background 0.15s;
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
  border-radius: 6px;
  background: rgba(221, 46, 68, 0.1);
  color: var(--nd-love);
  font-size: 0.8em;
  white-space: pre-wrap;
}
</style>
