<script setup lang="ts">
import { invoke } from '@tauri-apps/api/core'
import { ref } from 'vue'
import { useColumnTheme } from '@/composables/useColumnTheme'
import type { DeckColumn as DeckColumnType } from '@/stores/deck'
import DeckColumn from './DeckColumn.vue'

const props = defineProps<{
  column: DeckColumnType
}>()

const { columnThemeVars } = useColumnTheme(() => props.column)

const endpoint = ref('')
const params = ref('{}')
const response = ref<string | null>(null)
const error = ref<string | null>(null)
const loading = ref(false)

async function execute() {
  if (!endpoint.value.trim() || !props.column.accountId) return
  loading.value = true
  error.value = null
  response.value = null

  let parsedParams: Record<string, unknown> = {}
  try {
    const trimmed = params.value.trim()
    if (trimmed && trimmed !== '{}') {
      parsedParams = JSON.parse(trimmed)
    }
  } catch {
    error.value = 'パラメータのJSONが不正です'
    loading.value = false
    return
  }

  try {
    const result = await invoke('api_request', {
      accountId: props.column.accountId,
      endpoint: endpoint.value.trim(),
      params: parsedParams,
    })
    response.value = JSON.stringify(result, null, 2)
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e)
  } finally {
    loading.value = false
  }
}

function onKeydown(e: KeyboardEvent) {
  if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
    e.preventDefault()
    execute()
  }
}
</script>

<template>
  <DeckColumn
    :column-id="column.id"
    :title="column.name ?? 'APIコンソール'"
    :theme-vars="columnThemeVars"
  >
    <template #header-icon>
      <i class="ti ti-api tl-header-icon" />
    </template>

    <template #header-meta>
      <button
        class="_button header-run-btn"
        :class="{ loading }"
        :disabled="loading || !endpoint.trim() || !column.accountId"
        title="Send (Ctrl+Enter)"
        @click.stop="execute"
      >
        <i class="ti ti-send" />
      </button>
    </template>

    <div class="api-console" @keydown="onKeydown">
      <div class="input-section">
        <div class="endpoint-row">
          <span class="method-badge">POST</span>
          <input
            v-model="endpoint"
            class="endpoint-input"
            type="text"
            placeholder="users/show"
            spellcheck="false"
          />
        </div>

        <div class="params-section">
          <label class="params-label">パラメータ (JSON)</label>
          <textarea
            v-model="params"
            class="params-textarea"
            placeholder='{ "username": "example" }'
            spellcheck="false"
            rows="6"
          />
        </div>
      </div>

      <div class="response-section">
        <div v-if="!column.accountId" class="response-empty">
          アカウントが設定されていません
        </div>
        <div v-else-if="error" class="response-error">{{ error }}</div>
        <div v-else-if="response !== null" class="response-body">
          <pre>{{ response }}</pre>
        </div>
        <div v-else class="response-empty">
          Ctrl+Enter to send
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
  border-radius: var(--nd-radius-sm);
  background: var(--nd-accent);
  color: var(--nd-fgOnAccent);
  font-size: 0.85em;
  transition: background var(--nd-duration-base), opacity var(--nd-duration-base);
}

.header-run-btn:hover:not(:disabled) {
  background: var(--nd-accentDarken);
}

.header-run-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.header-run-btn.loading i {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

.api-console {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
  overflow: hidden;
}

.input-section {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 10px;
  border-bottom: 1px solid var(--nd-divider);
  flex-shrink: 0;
}

.endpoint-row {
  display: flex;
  align-items: center;
  gap: 6px;
}

.method-badge {
  display: inline-flex;
  align-items: center;
  padding: 4px 8px;
  border-radius: 4px;
  background: var(--nd-accent);
  color: var(--nd-fgOnAccent);
  font-size: 0.7em;
  font-weight: bold;
  letter-spacing: 0.05em;
  flex-shrink: 0;
}

.endpoint-input {
  flex: 1;
  padding: 6px 10px;
  border: 1px solid var(--nd-divider);
  border-radius: var(--nd-radius-sm);
  background: var(--nd-bg);
  color: var(--nd-fg);
  font-family: 'Fira Code', 'Cascadia Code', 'Consolas', monospace;
  font-size: 0.85em;
  outline: none;
  transition: border-color var(--nd-duration-base);
}

.endpoint-input:focus {
  border-color: var(--nd-accent);
}

.params-section {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.params-label {
  font-size: 0.7em;
  font-weight: bold;
  opacity: 0.5;
}

.params-textarea {
  padding: 8px 10px;
  border: 1px solid var(--nd-divider);
  border-radius: var(--nd-radius-sm);
  background: var(--nd-bg);
  color: var(--nd-fg);
  font-family: 'Fira Code', 'Cascadia Code', 'Consolas', monospace;
  font-size: 0.8em;
  line-height: 1.5;
  resize: vertical;
  outline: none;
  transition: border-color var(--nd-duration-base);
}

.params-textarea:focus {
  border-color: var(--nd-accent);
}

.response-section {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 10px;
}

.response-error {
  padding: 6px 8px;
  border-radius: var(--nd-radius-sm);
  background: var(--nd-love-subtle);
  color: var(--nd-love);
  font-size: 0.8em;
  white-space: pre-wrap;
}

.response-body pre {
  margin: 0;
  font-family: 'Fira Code', 'Cascadia Code', 'Consolas', monospace;
  font-size: 0.75em;
  line-height: 1.5;
  white-space: pre-wrap;
  word-break: break-all;
}

.response-empty {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  opacity: 0.3;
  font-size: 0.85em;
}
</style>
