<script setup lang="ts">
import { type Ast, Interpreter, Parser } from '@syuilo/aiscript'
import { invoke } from '@tauri-apps/api/core'
import { computed, defineAsyncComponent, onUnmounted, ref, watch } from 'vue'
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

import { useColumnTheme } from '@/composables/useColumnTheme'
import type { DeckColumn as DeckColumnType } from '@/stores/deck'
import { useDeckStore } from '@/stores/deck'
import DeckColumn from './DeckColumn.vue'
import AiScriptEditor from './widgets/AiScriptEditor.vue'
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

const code = ref(props.column.aiscriptCode ?? '<: "Hello, AiScript!"')
const output = ref<{ text: string; isError: boolean }[]>([])
const uiComponents = ref<UiComponent[]>([])
const error = ref<string | null>(null)
const running = ref(false)
const interpreter = ref<Interpreter | null>(null)

// Output panel tab: 'output' | 'inspector'
const outputTab = ref<'output' | 'inspector'>('output')

// Inspector: track which components are expanded
const inspectorExpanded = ref(new Set<string>())

function toggleInspectorItem(id: string) {
  if (inspectorExpanded.value.has(id)) {
    inspectorExpanded.value.delete(id)
  } else {
    inspectorExpanded.value.add(id)
  }
}

function flattenComponents(components: UiComponent[]): UiComponent[] {
  const result: UiComponent[] = []
  for (const c of components) {
    result.push(c)
    if (c.children?.length) {
      result.push(...flattenComponents(c.children))
    }
  }
  return result
}

function stringifyUiProps(props: Record<string, unknown>): string {
  const cleaned: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(props)) {
    if (k === 'children') continue
    if (
      v &&
      typeof v === 'object' &&
      'type' in v &&
      (v as { type: string }).type === 'fn'
    ) {
      cleaned[k] = '(function)'
    } else {
      cleaned[k] = v
    }
  }
  return JSON.stringify(cleaned, null, 2)
}
const toastRef = ref<InstanceType<typeof AiScriptToast> | null>(null)
const dialogRef = ref<InstanceType<typeof AiScriptDialog> | null>(null)
let currentNdCtx: Parameters<typeof cleanupNoteDeckEnv>[0] | null = null

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
      USER_ID: account.value?.userId ?? '',
      USER_NAME: '',
      USER_USERNAME: '',
      LOCALE: navigator.language,
      SERVER_URL: serverUrl.value,
    },
  )

  const ndCtx: NoteDeckEnvContext = {
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
  <DeckColumn :column-id="column.id" :title="column.name ?? 'スクラッチパッド'" :theme-vars="columnThemeVars">
    <template #header-icon>
      <i class="ti ti-terminal-2 tl-header-icon" />
    </template>

    <template #header-meta>
      <button
        class="_button"
        :class="[$style.headerRunBtn, { [$style.running]: running }]"
        :disabled="running"
        title="Run (Ctrl+Enter)"
        @click.stop="run"
      >
        <i class="ti ti-player-play" />
      </button>
    </template>

    <AiScriptToast ref="toastRef" />
    <AiScriptDialog ref="dialogRef" />
    <div ref="bodyRef" :class="$style.aisColBody" @keydown="onKeydown">
      <div
        :class="$style.editorPanel"
        :style="{ flex: `${editorRatio} 0 0` }"
      >
        <AiScriptEditor
          v-model="code"
          placeholder="AiScript..."
          max-height="none"
          use-lsp
        />
      </div>

      <div :class="$style.resizeHandle" @mousedown="startResize">
        <div :class="$style.resizeGrip" />
      </div>

      <div
        :class="$style.outputSection"
        :style="{ flex: `${1 - editorRatio} 0 0` }"
      >
        <div :class="$style.outputTabs">
          <button
            class="_button"
            :class="[$style.outputTab, { [$style.active]: outputTab === 'output' }]"
            @click="outputTab = 'output'"
          >
            <i class="ti ti-terminal" />
            出力
          </button>
          <button
            class="_button"
            :class="[$style.outputTab, { [$style.active]: outputTab === 'inspector' }]"
            @click="outputTab = 'inspector'"
          >
            <i class="ti ti-eye-code" />
            UI
            <span v-if="uiComponents.length" :class="$style.tabBadge">{{ flattenComponents(uiComponents).length }}</span>
          </button>
        </div>

        <div v-show="outputTab === 'output'" :class="$style.outputPanel">
          <div v-if="error" :class="$style.outputError">{{ error }}</div>

          <AiScriptUiRenderer
            v-if="uiComponents.length"
            :components="uiComponents"
            :interpreter="(interpreter as Interpreter | null)"
            :server-url="serverUrl"
            @post="handlePost"
          />

          <div v-if="output.length" :class="$style.consoleOutput">
            <div
              v-for="(line, i) in output"
              :key="i"
              :class="[$style.outputLine, { [$style.error]: line.isError }]"
            >
              {{ line.text }}
            </div>
          </div>

          <div
            v-if="!error && !output.length && !uiComponents.length"
            :class="$style.outputEmpty"
          >
            Ctrl+Enter to run
          </div>
        </div>

        <div v-show="outputTab === 'inspector'" :class="$style.inspectorPanel">
          <div v-if="!uiComponents.length" :class="$style.outputEmpty">
            UIコンポーネントなし
          </div>
          <div v-else :class="$style.inspectorList">
            <div
              v-for="comp in flattenComponents(uiComponents)"
              :key="comp.id"
              :class="$style.inspectorItem"
            >
              <button class="_button" :class="$style.inspectorItemHeader" @click="toggleInspectorItem(comp.id)">
                <i
                  class="ti"
                  :class="inspectorExpanded.has(comp.id) ? 'ti-chevron-down' : 'ti-chevron-right'"
                />
                <span :class="$style.inspectorTypeBadge">{{ comp.type }}</span>
                <span :class="$style.inspectorId">{{ comp.id }}</span>
              </button>
              <div v-if="inspectorExpanded.has(comp.id)" :class="$style.inspectorProps">
                <pre>{{ stringifyUiProps(comp.props) }}</pre>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
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
.headerRunBtn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border-radius: var(--nd-radius-sm);
  background: var(--nd-accent);
  color: var(--nd-fgOnAccent);
  font-size: 0.85em;
  transition: background var(--nd-duration-base), opacity var(--nd-duration-base);

  &:hover:not(:disabled) {
    background: var(--nd-accentDarken);
  }

  &:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  &.running i {
    animation: spin 1s linear infinite;
  }
}

.running {
  /* used as modifier */
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

.aisColBody {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
  overflow: hidden;
}

.editorPanel {
  display: flex;
  flex-direction: column;
  min-height: 0;
  overflow: hidden;
}

.resizeHandle {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 8px;
  cursor: row-resize;
  background: var(--nd-bg);
  border-top: 1px solid var(--nd-divider);
  border-bottom: 1px solid var(--nd-divider);
  flex-shrink: 0;

  &:hover .resizeGrip {
    background: var(--nd-accent);
  }
}

.resizeGrip {
  width: 32px;
  height: 3px;
  border-radius: 2px;
  background: var(--nd-divider);
  transition: background var(--nd-duration-base);
}

.outputSection {
  display: flex;
  flex-direction: column;
  min-height: 0;
  overflow: hidden;
}

.outputTabs {
  display: flex;
  gap: 0;
  border-bottom: 1px solid var(--nd-divider);
  flex-shrink: 0;
}

.outputTab {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 6px 12px;
  font-size: 0.75em;
  font-weight: bold;
  color: var(--nd-fg);
  opacity: 0.5;
  border-bottom: 2px solid transparent;
  transition: opacity var(--nd-duration-base), border-color var(--nd-duration-base);

  &:hover {
    opacity: 0.8;
  }

  &.active {
    opacity: 1;
    border-bottom-color: var(--nd-accent);
    color: var(--nd-accent);
  }
}

.active {
  /* used as modifier */
}

.tabBadge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 16px;
  height: 16px;
  padding: 0 4px;
  border-radius: var(--nd-radius-md);
  background: var(--nd-accent);
  color: var(--nd-fgOnAccent);
  font-size: 0.85em;
  line-height: 1;
}

.outputPanel {
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-height: 0;
  overflow-y: auto;
  padding: 10px;
  flex: 1;
}

.inspectorPanel {
  display: flex;
  flex-direction: column;
  min-height: 0;
  overflow-y: auto;
  flex: 1;
}

.inspectorList {
  display: flex;
  flex-direction: column;
}

.inspectorItem {
  border-bottom: 1px solid var(--nd-divider);
}

.inspectorItemHeader {
  display: flex;
  align-items: center;
  gap: 6px;
  width: 100%;
  padding: 6px 10px;
  font-size: 0.8em;
  text-align: left;
  transition: background var(--nd-duration-base);

  &:hover {
    background: var(--nd-buttonHoverBg);
  }
}

.inspectorTypeBadge {
  display: inline-block;
  padding: 1px 6px;
  border-radius: 4px;
  background: var(--nd-accent);
  color: var(--nd-fgOnAccent);
  font-size: 0.85em;
  font-weight: bold;
}

.inspectorId {
  opacity: 0.5;
  font-family: 'Fira Code', 'Cascadia Code', 'Consolas', monospace;
  font-size: 0.85em;
}

.inspectorProps {
  padding: 4px 10px 8px 28px;

  pre {
    margin: 0;
    padding: 6px 8px;
    border-radius: var(--nd-radius-sm);
    background: color-mix(in srgb, var(--nd-fg) 5%, transparent);
    font-family: 'Fira Code', 'Cascadia Code', 'Consolas', monospace;
    font-size: 0.75em;
    line-height: 1.4;
    white-space: pre-wrap;
    word-break: break-all;
    overflow-x: auto;
  }
}

.outputError {
  padding: 6px 8px;
  border-radius: var(--nd-radius-sm);
  background: var(--nd-love-subtle);
  color: var(--nd-love);
  font-size: 0.8em;
  white-space: pre-wrap;
}

.consoleOutput {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.outputLine {
  font-family: 'Fira Code', 'Cascadia Code', 'Consolas', monospace;
  font-size: 0.8em;
  line-height: 1.5;
  white-space: pre-wrap;
  word-break: break-all;

  &.error {
    color: var(--nd-love);
  }
}

.error {
  /* used as modifier */
}

.outputEmpty {
  display: flex;
  align-items: center;
  justify-content: center;
  flex: 1;
  opacity: 0.3;
  font-size: 0.85em;
}
</style>
