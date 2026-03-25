<script setup lang="ts">
import { markdown } from '@codemirror/lang-markdown'
import { languages } from '@codemirror/language-data'
import { computed, ref, watch } from 'vue'
import EditorTabs from '@/components/common/EditorTabs.vue'
import CodeEditor from '@/components/deck/widgets/CodeEditor.vue'
import { useClickOutside } from '@/composables/useClickOutside'
import { useEditorTabs } from '@/composables/useEditorTabs'

const mdLang = markdown({ codeLanguages: languages })

const { tab, containerRef: editorRef } = useEditorTabs(
  ['api', 'prompt'] as const,
  'api',
)

// --- API Settings (mock, localStorage-backed) ---

interface AiConfig {
  provider: 'ollama' | 'openai' | 'custom'
  ollamaEndpoint: string
  ollamaModel: string
  openaiApiKey: string
  openaiModel: string
  customEndpoint: string
  customApiKey: string
  customModel: string
  systemPrompt: string
}

const STORAGE_KEY = 'nd-ai-settings'

function loadConfig(): AiConfig {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) return { ...defaultConfig(), ...JSON.parse(raw) }
  } catch {
    /* ignore */
  }
  return defaultConfig()
}

function defaultConfig(): AiConfig {
  return {
    provider: 'ollama',
    ollamaEndpoint: 'http://localhost:11434',
    ollamaModel: '',
    openaiApiKey: '',
    openaiModel: 'gpt-4o',
    customEndpoint: '',
    customApiKey: '',
    customModel: '',
    systemPrompt: '',
  }
}

const config = ref<AiConfig>(loadConfig())

let saveTimer: ReturnType<typeof setTimeout> | null = null
watch(
  config,
  (c) => {
    if (saveTimer) clearTimeout(saveTimer)
    saveTimer = setTimeout(() => {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(c))
    }, 300)
  },
  { deep: true },
)

// Provider dropdown
const showProviderDropdown = ref(false)
const providerDropdownRef = ref<HTMLElement | null>(null)

interface ProviderOption {
  value: AiConfig['provider']
  label: string
  icon: string
}

const PROVIDERS: ProviderOption[] = [
  { value: 'ollama', label: 'Ollama', icon: 'ti-server' },
  { value: 'openai', label: 'OpenAI', icon: 'ti-brand-openai' },
  { value: 'custom', label: 'カスタム (OpenAI互換)', icon: 'ti-plug' },
]

const selectedProvider = computed(
  () =>
    PROVIDERS.find((p) => p.value === config.value.provider) ?? PROVIDERS[0],
)

function selectProvider(value: AiConfig['provider']) {
  config.value.provider = value
  showProviderDropdown.value = false
}

useClickOutside(providerDropdownRef, () => {
  showProviderDropdown.value = false
})

// Connection test
const testStatus = ref<'idle' | 'testing' | 'ok' | 'error'>('idle')
const testMessage = ref('')

async function testConnection() {
  testStatus.value = 'testing'
  testMessage.value = ''

  try {
    let url: string
    if (config.value.provider === 'ollama') {
      url = `${config.value.ollamaEndpoint}/api/tags`
    } else if (config.value.provider === 'openai') {
      url = 'https://api.openai.com/v1/models'
    } else {
      url = `${config.value.customEndpoint}/models`
    }

    const headers: Record<string, string> = {}
    if (config.value.provider === 'openai' && config.value.openaiApiKey) {
      headers.Authorization = `Bearer ${config.value.openaiApiKey}`
    } else if (
      config.value.provider === 'custom' &&
      config.value.customApiKey
    ) {
      headers.Authorization = `Bearer ${config.value.customApiKey}`
    }

    const res = await fetch(url, { headers, signal: AbortSignal.timeout(5000) })
    if (res.ok) {
      testStatus.value = 'ok'
      testMessage.value = '接続成功'
    } else {
      testStatus.value = 'error'
      testMessage.value = `HTTP ${res.status}`
    }
  } catch (e) {
    testStatus.value = 'error'
    testMessage.value = e instanceof Error ? e.message : '接続失敗'
  }

  setTimeout(() => {
    if (testStatus.value !== 'testing') testStatus.value = 'idle'
  }, 3000)
}

// API key visibility
const showApiKey = ref(false)
</script>

<template>
  <div ref="editorRef" :class="$style.content">
    <EditorTabs
      v-model="tab"
      :tabs="[
        { value: 'api', icon: 'plug-connected', label: 'API' },
        { value: 'prompt', icon: 'markdown', label: 'プロンプト' },
      ]"
    />

    <!-- API Settings Tab -->
    <div v-show="tab === 'api'" :class="$style.panel">
      <!-- Provider -->
      <div :class="$style.section">
        <div :class="$style.sectionLabel">
          <i class="ti ti-cloud" />
          プロバイダー
        </div>
        <div ref="providerDropdownRef" :class="$style.dropdown">
          <button
            class="_button"
            :class="$style.dropdownTrigger"
            @click="showProviderDropdown = !showProviderDropdown"
          >
            <i :class="'ti ' + selectedProvider.icon" />
            <span>{{ selectedProvider.label }}</span>
            <i class="ti ti-chevron-down" :class="$style.dropdownChevron" />
          </button>
          <div v-if="showProviderDropdown" :class="$style.dropdownPanel">
            <button
              v-for="opt in PROVIDERS"
              :key="opt.value"
              class="_button"
              :class="[$style.dropdownItem, { [$style.selected]: config.provider === opt.value }]"
              @click="selectProvider(opt.value)"
            >
              <i :class="'ti ' + opt.icon" />
              <span>{{ opt.label }}</span>
              <i v-if="config.provider === opt.value" class="ti ti-check" :class="$style.checkIcon" />
            </button>
          </div>
        </div>
      </div>

      <!-- Ollama Settings -->
      <template v-if="config.provider === 'ollama'">
        <div :class="$style.section">
          <div :class="$style.sectionLabel">
            <i class="ti ti-link" />
            エンドポイント
          </div>
          <input
            v-model="config.ollamaEndpoint"
            :class="$style.input"
            type="text"
            placeholder="http://localhost:11434"
          />
        </div>
        <div :class="$style.section">
          <div :class="$style.sectionLabel">
            <i class="ti ti-cube" />
            モデル
          </div>
          <input
            v-model="config.ollamaModel"
            :class="$style.input"
            type="text"
            placeholder="llama3, gemma2, etc."
          />
        </div>
      </template>

      <!-- OpenAI Settings -->
      <template v-if="config.provider === 'openai'">
        <div :class="$style.section">
          <div :class="$style.sectionLabel">
            <i class="ti ti-key" />
            APIキー
          </div>
          <div :class="$style.inputRow">
            <input
              v-model="config.openaiApiKey"
              :class="$style.input"
              :type="showApiKey ? 'text' : 'password'"
              placeholder="sk-..."
            />
            <button
              class="_button"
              :class="$style.visibilityBtn"
              @click="showApiKey = !showApiKey"
            >
              <i :class="showApiKey ? 'ti ti-eye-off' : 'ti ti-eye'" />
            </button>
          </div>
        </div>
        <div :class="$style.section">
          <div :class="$style.sectionLabel">
            <i class="ti ti-cube" />
            モデル
          </div>
          <input
            v-model="config.openaiModel"
            :class="$style.input"
            type="text"
            placeholder="gpt-4o"
          />
        </div>
      </template>

      <!-- Custom Settings -->
      <template v-if="config.provider === 'custom'">
        <div :class="$style.section">
          <div :class="$style.sectionLabel">
            <i class="ti ti-link" />
            エンドポイント
          </div>
          <input
            v-model="config.customEndpoint"
            :class="$style.input"
            type="text"
            placeholder="https://api.example.com/v1"
          />
        </div>
        <div :class="$style.section">
          <div :class="$style.sectionLabel">
            <i class="ti ti-key" />
            APIキー
          </div>
          <div :class="$style.inputRow">
            <input
              v-model="config.customApiKey"
              :class="$style.input"
              :type="showApiKey ? 'text' : 'password'"
              placeholder="APIキー（任意）"
            />
            <button
              class="_button"
              :class="$style.visibilityBtn"
              @click="showApiKey = !showApiKey"
            >
              <i :class="showApiKey ? 'ti ti-eye-off' : 'ti ti-eye'" />
            </button>
          </div>
        </div>
        <div :class="$style.section">
          <div :class="$style.sectionLabel">
            <i class="ti ti-cube" />
            モデル
          </div>
          <input
            v-model="config.customModel"
            :class="$style.input"
            type="text"
            placeholder="モデル名"
          />
        </div>
      </template>

      <!-- Connection Test -->
      <div :class="$style.section">
        <button
          class="_button"
          :class="[$style.testBtn, { [$style.testing]: testStatus === 'testing' }]"
          :disabled="testStatus === 'testing'"
          @click="testConnection"
        >
          <i :class="testStatus === 'testing' ? 'ti ti-loader-2' : 'ti ti-plug-connected'" />
          {{ testStatus === 'testing' ? '接続テスト中...' : '接続テスト' }}
        </button>
        <div v-if="testStatus === 'ok'" :class="$style.testSuccess">
          <i class="ti ti-check" />
          {{ testMessage }}
        </div>
        <div v-if="testStatus === 'error'" :class="$style.testError">
          <i class="ti ti-alert-triangle" />
          {{ testMessage }}
        </div>
      </div>
    </div>

    <!-- System Prompt Tab -->
    <div v-show="tab === 'prompt'" :class="$style.promptPanel">
      <div :class="$style.promptHint">
        AIアシスタントに渡すカスタムシステムプロンプトをMarkdownで記述できます
      </div>
      <CodeEditor
        v-model="config.systemPrompt"
        :language="mdLang"
        :class="$style.promptEditor"
      />
      <div :class="$style.promptFooter">
        <span :class="$style.promptCharCount">
          {{ config.systemPrompt.length }} 文字
        </span>
        <button
          v-if="config.systemPrompt.trim()"
          class="_button"
          :class="$style.promptClearBtn"
          @click="config.systemPrompt = ''"
        >
          <i class="ti ti-trash" />
          クリア
        </button>
      </div>
    </div>
  </div>
</template>

<style lang="scss" module>
@use '@/styles/buttons' as *;

.content {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
  overflow: hidden;
}

.selected { /* modifier */ }

.panel {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  scrollbar-color: var(--nd-scrollbarHandle) transparent;
  scrollbar-width: thin;
}

.section {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px 10px;
  border-bottom: 1px solid var(--nd-divider);
}

.sectionLabel {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 0.8em;
  font-weight: bold;
  opacity: 0.7;
}

.input {
  width: 100%;
  padding: 6px 10px;
  border: 1px solid var(--nd-divider);
  border-radius: var(--nd-radius-sm);
  background: var(--nd-bg);
  color: var(--nd-fg);
  font-size: 0.8em;
  font-family: inherit;
  outline: none;
  transition: border-color var(--nd-duration-base);

  &:focus {
    border-color: var(--nd-accent);
  }

  &::placeholder {
    color: var(--nd-fg);
    opacity: 0.35;
  }
}

.inputRow {
  display: flex;
  gap: 4px;
  align-items: center;

  .input {
    flex: 1;
    min-width: 0;
  }
}

.visibilityBtn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border-radius: var(--nd-radius-sm);
  opacity: 0.5;
  flex-shrink: 0;
  transition: opacity var(--nd-duration-base), background var(--nd-duration-base);

  &:hover {
    background: var(--nd-buttonHoverBg);
    opacity: 1;
  }
}

// Dropdown (reuse CssEditorContent pattern)
.dropdown {
  position: relative;
  width: 100%;
}

.dropdownTrigger {
  display: flex;
  align-items: center;
  gap: 6px;
  width: 100%;
  padding: 6px 10px;
  border: 1px solid var(--nd-divider);
  border-radius: var(--nd-radius-sm);
  background: var(--nd-bg);
  color: var(--nd-fg);
  font-size: 0.8em;
  text-align: left;
  transition: border-color var(--nd-duration-base), background var(--nd-duration-base);

  &:hover { background: var(--nd-buttonHoverBg); }
}

.dropdownChevron {
  margin-left: auto;
  opacity: 0.4;
  font-size: 0.85em;
}

.dropdownPanel {
  position: absolute;
  top: 100%;
  left: 0;
  right: 0;
  z-index: 100;
  max-height: 240px;
  overflow-y: auto;
  margin-top: 2px;
  border: 1px solid var(--nd-divider);
  border-radius: var(--nd-radius-sm);
  background: var(--nd-panel);
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.25);
}

.dropdownItem {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 7px 10px;
  font-size: 0.8em;
  color: var(--nd-fg);
  text-align: left;
  cursor: pointer;
  transition: background var(--nd-duration-base);

  &:hover { background: var(--nd-buttonHoverBg); }
  &.selected { color: var(--nd-accent); }
  & + & { border-top: 1px solid color-mix(in srgb, var(--nd-divider) 50%, transparent); }
}

.checkIcon { margin-left: auto; opacity: 0.7; flex-shrink: 0; }

// Connection test
.testBtn {
  @include btn-secondary;

  &.testing {
    opacity: 0.6;

    i { animation: spin 1s linear infinite; }
  }
}

.testing { /* modifier */ }

.testSuccess {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 0.75em;
  color: var(--nd-accent);
  opacity: 0.8;
}

.testError {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 6px 8px;
  border-radius: var(--nd-radius-sm);
  background: color-mix(in srgb, var(--nd-love) 10%, var(--nd-bg));
  color: var(--nd-love);
  font-size: 0.75em;
  word-break: break-all;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

// Prompt tab
.promptPanel {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 10px;
  flex: 1;
  min-height: 0;
  overflow: hidden;
}

.promptHint {
  font-size: 0.75em;
  opacity: 0.4;
}

.promptEditor {
  flex: 1;
  min-height: 200px;
}

.promptFooter {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}

.promptCharCount {
  font-size: 0.7em;
  opacity: 0.4;
}

.promptClearBtn {
  margin-left: auto;
  padding: 2px 8px;
  border-radius: var(--nd-radius-sm);
  background: var(--nd-buttonBg);
  color: var(--nd-fg);
  font-size: 0.7em;
  opacity: 0.6;
  display: flex;
  align-items: center;
  gap: 4px;
  transition: opacity var(--nd-duration-base), background var(--nd-duration-base);

  &:hover { opacity: 1; background: var(--nd-buttonHoverBg); }
}
</style>
