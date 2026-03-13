<script setup lang="ts">
import { invoke } from '@tauri-apps/api/core'
import { ref, watch } from 'vue'
import { executeAiScript } from '@/aiscript/execute'
import type { WidgetConfig } from '@/stores/deck'
import { useDeckStore } from '@/stores/deck'
import AiScriptEditor from './AiScriptEditor.vue'

const props = defineProps<{
  widget: WidgetConfig
  columnId: string
  accountId: string | null
}>()

const deckStore = useDeckStore()
const code = ref((props.widget.data.code as string) ?? '<: "Hello, AiScript!"')
const output = ref<{ text: string; isError: boolean }[]>([])
const running = ref(false)

// Persist code on change (debounced)
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
  output.value = []

  await executeAiScript(code.value, {
    onOutput: (text) => {
      output.value.push({ text, isError: false })
    },
    onError: (err) => {
      output.value.push({ text: err.message, isError: true })
    },
    api: props.accountId
      ? async (endpoint, params) => {
          return invoke('api_request', {
            accountId: props.accountId,
            endpoint,
            params,
          })
        }
      : undefined,
    storagePrefix: `console-${props.widget.id}`,
  })

  running.value = false
}
</script>

<template>
  <div :class="$style.widgetConsole">
    <AiScriptEditor v-model="code" placeholder="AiScript..." />
    <div :class="$style.consoleToolbar">
      <button :class="$style.runBtn" :disabled="running" @click="run">
        <i class="ti ti-player-play" />
      </button>
    </div>
    <div v-if="output.length" :class="$style.consoleOutput">
      <div
        v-for="(line, i) in output"
        :key="i"
        :class="[$style.outputLine, { [$style.error]: line.isError }]"
      >
        {{ line.text }}
      </div>
    </div>
  </div>
</template>

<style lang="scss" module>
.widgetConsole {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.consoleToolbar {
  display: flex;
  justify-content: flex-end;
}

.runBtn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border: none;
  border-radius: var(--nd-radius-sm);
  background: var(--nd-accent);
  color: var(--nd-fgOnAccent);
  cursor: pointer;
  font-size: 0.85em;
  transition: background var(--nd-duration-fast);

  &:hover:not(:disabled) {
    background: var(--nd-accentDarken);
  }

  &:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }
}

.consoleOutput {
  padding: 8px 10px;
  border-radius: var(--nd-radius-sm);
  background: var(--nd-bg);
  font-family: 'Fira Code', 'Cascadia Code', 'Consolas', monospace;
  font-size: 0.8em;
  line-height: 1.6;
  max-height: 200px;
  overflow-y: auto;
}

.outputLine {
  white-space: pre-wrap;
  word-break: break-all;

  &.error {
    color: var(--nd-love);
  }
}
</style>
