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
      <i class="ti ti-api" :class="$style.tlHeaderIcon" />
    </template>

    <template #header-meta>
      <button
        class="_button"
        :class="[$style.headerRunBtn, { [$style.loading]: loading }]"
        :disabled="loading || !endpoint.trim() || !column.accountId"
        title="Send (Ctrl+Enter)"
        @click.stop="execute"
      >
        <i class="ti ti-send" />
      </button>
    </template>

    <div :class="$style.apiConsole" @keydown="onKeydown">
      <div :class="$style.inputSection">
        <div :class="$style.endpointRow">
          <span :class="$style.methodBadge">POST</span>
          <input
            v-model="endpoint"
            :class="$style.endpointInput"
            type="text"
            placeholder="users/show"
            spellcheck="false"
          />
        </div>

        <div :class="$style.paramsSection">
          <label :class="$style.paramsLabel">パラメータ (JSON)</label>
          <textarea
            v-model="params"
            :class="$style.paramsTextarea"
            placeholder='{ "username": "example" }'
            spellcheck="false"
            rows="6"
          />
        </div>
      </div>

      <div :class="$style.responseSection">
        <div v-if="!column.accountId" :class="$style.responseEmpty">
          アカウントが設定されていません
        </div>
        <div v-else-if="error" :class="$style.responseError">{{ error }}</div>
        <div v-else-if="response !== null" :class="$style.responseBody">
          <pre>{{ response }}</pre>
        </div>
        <div v-else :class="$style.responseEmpty">
          Ctrl+Enter to send
        </div>
      </div>
    </div>
  </DeckColumn>
</template>

<style lang="scss" module>
.tlHeaderIcon {
  flex-shrink: 0;
  opacity: 0.7;
}

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

  &.loading i {
    animation: spin 1s linear infinite;
  }
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

.apiConsole {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
  overflow: hidden;
}

.inputSection {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 10px;
  border-bottom: 1px solid var(--nd-divider);
  flex-shrink: 0;
}

.endpointRow {
  display: flex;
  align-items: center;
  gap: 6px;
}

.methodBadge {
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

.endpointInput {
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

  &:focus {
    border-color: var(--nd-accent);
  }
}

.paramsSection {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.paramsLabel {
  font-size: 0.7em;
  font-weight: bold;
  opacity: 0.5;
}

.paramsTextarea {
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

  &:focus {
    border-color: var(--nd-accent);
  }
}

.responseSection {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 10px;
}

.responseError {
  padding: 6px 8px;
  border-radius: var(--nd-radius-sm);
  background: var(--nd-love-subtle);
  color: var(--nd-love);
  font-size: 0.8em;
  white-space: pre-wrap;
}

.responseBody pre {
  margin: 0;
  font-family: 'Fira Code', 'Cascadia Code', 'Consolas', monospace;
  font-size: 0.75em;
  line-height: 1.5;
  white-space: pre-wrap;
  word-break: break-all;
}

.responseEmpty {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  opacity: 0.3;
  font-size: 0.85em;
}
</style>
