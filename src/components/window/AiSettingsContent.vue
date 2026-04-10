<script setup lang="ts">
import { markdown } from '@codemirror/lang-markdown'
import { languages } from '@codemirror/language-data'
import { computed, reactive, ref, watch } from 'vue'
import EditorTabs from '@/components/common/EditorTabs.vue'
import CodeEditor from '@/components/deck/widgets/CodeEditor.vue'
import {
  type AiConfig,
  defaultConfig,
  PROVIDER_KEYS,
  type ProviderKey,
  type ProviderSettings,
  useAiConfig,
} from '@/composables/useAiConfig'
import { useClickOutside } from '@/composables/useClickOutside'
import { useClipboardFeedback } from '@/composables/useClipboardFeedback'
import { useDoubleConfirm } from '@/composables/useDoubleConfirm'
import { useEditorTabs } from '@/composables/useEditorTabs'
import { commands, unwrap } from '@/utils/tauriInvoke'

const mdLang = markdown({ codeLanguages: languages })

const { tab, containerRef: editorRef } = useEditorTabs(
  ['api', 'prompt'] as const,
  'api',
)

// --- Provider schema (data-driven UI) ---

interface ProviderOption {
  value: ProviderKey
  label: string
  icon: string
  /** URL path appended to endpoint for connection test */
  testPath: string
}

interface FieldDef {
  key: keyof ProviderSettings
  label: string
  icon: string
  secret?: boolean
  placeholder: string
}

const PROVIDERS: ProviderOption[] = [
  {
    value: 'ollama',
    label: 'Ollama',
    icon: 'ti-server',
    testPath: '/api/tags',
  },
  {
    value: 'openai',
    label: 'OpenAI',
    icon: 'ti-brand-openai',
    testPath: '/models',
  },
  {
    value: 'custom',
    label: 'カスタム (OpenAI互換)',
    icon: 'ti-plug',
    testPath: '/models',
  },
]

const PROVIDER_FIELDS: Record<ProviderKey, FieldDef[]> = {
  ollama: [
    {
      key: 'endpoint',
      label: 'エンドポイント',
      icon: 'ti-link',
      placeholder: 'http://localhost:11434',
    },
    {
      key: 'model',
      label: 'モデル',
      icon: 'ti-cube',
      placeholder: 'llama3, gemma2, etc.',
    },
  ],
  openai: [
    {
      key: 'apiKey',
      label: 'APIキー',
      icon: 'ti-key',
      secret: true,
      placeholder: 'sk-...',
    },
    {
      key: 'model',
      label: 'モデル',
      icon: 'ti-cube',
      placeholder: 'gpt-4o',
    },
  ],
  custom: [
    {
      key: 'endpoint',
      label: 'エンドポイント',
      icon: 'ti-link',
      placeholder: 'https://api.example.com/v1',
    },
    {
      key: 'apiKey',
      label: 'APIキー',
      icon: 'ti-key',
      secret: true,
      placeholder: 'APIキー（任意）',
    },
    {
      key: 'model',
      label: 'モデル',
      icon: 'ti-cube',
      placeholder: 'モデル名',
    },
  ],
}

// --- Config (delegated to composable) ---

const { config, save: saveConfig, toFileConfig, mergeConfig } = useAiConfig()

const expandedSections = reactive<Record<string, boolean>>({ provider: true })

function toggleSection(key: string) {
  expandedSections[key] = !expandedSections[key]
}

let saveTimer: ReturnType<typeof setTimeout> | null = null
watch(
  config,
  () => {
    if (saveTimer) clearTimeout(saveTimer)
    saveTimer = setTimeout(saveConfig, 300)
  },
  { deep: true },
)

// --- Computed helpers ---

const currentProvider = computed(
  () =>
    // biome-ignore lint: PROVIDERS is a non-empty constant array
    PROVIDERS.find((p) => p.value === config.value.provider) ?? PROVIDERS[0]!,
)

const currentFields = computed(() => PROVIDER_FIELDS[config.value.provider])

const currentSettings = computed(() => config.value[config.value.provider])

// --- Provider dropdown ---

const showProviderDropdown = ref(false)
const providerDropdownRef = ref<HTMLElement | null>(null)

function selectProvider(value: ProviderKey) {
  config.value.provider = value
  showProviderDropdown.value = false
}

useClickOutside(providerDropdownRef, () => {
  showProviderDropdown.value = false
})

// --- Connection test ---

const testStatus = ref<'idle' | 'testing' | 'ok' | 'error'>('idle')
const testMessage = ref('')

async function testConnection() {
  testStatus.value = 'testing'
  testMessage.value = ''

  try {
    const provider = currentProvider.value
    const settings = currentSettings.value
    const url = `${settings.endpoint}${provider.testPath}`

    const result = unwrap(
      await commands.checkEndpointHealth(url, settings.apiKey || null),
    ) as unknown as {
      ok: boolean
      status: number
      message: string
    }
    if (result.ok) {
      testStatus.value = 'ok'
      testMessage.value = result.message
    } else {
      testStatus.value = 'error'
      testMessage.value = result.message
    }
  } catch (e) {
    testStatus.value = 'error'
    testMessage.value = e instanceof Error ? e.message : '接続失敗'
  }

  setTimeout(() => {
    if (testStatus.value !== 'testing') testStatus.value = 'idle'
  }, 3000)
}

// --- API key visibility ---

const showApiKey = ref(false)

// --- Import/Export ---

const {
  copied: copiedMessage,
  imported: importedMessage,
  importError,
  showCopied,
  showImported,
  showImportError,
} = useClipboardFeedback()

function exportConfig() {
  navigator.clipboard.writeText(
    JSON.stringify(toFileConfig(config.value), null, 2),
  )
  showCopied()
}

async function importConfig() {
  try {
    const text = await navigator.clipboard.readText()
    const parsed = JSON.parse(text)
    if (!parsed || typeof parsed !== 'object') {
      showImportError()
      return
    }
    // Preserve existing secrets
    const secrets = Object.fromEntries(
      PROVIDER_KEYS.map((k) => [k, config.value[k].apiKey]),
    )
    config.value = mergeConfig(defaultConfig(), parsed as Partial<AiConfig>)
    for (const k of PROVIDER_KEYS) {
      config.value[k].apiKey = secrets[k] ?? ''
    }
    saveConfig()
    showImported()
  } catch {
    showImportError()
  }
}

// --- Reset ---

const { confirming: confirmingReset, trigger: triggerReset } =
  useDoubleConfirm()

function handleReset() {
  triggerReset(() => {
    config.value = defaultConfig()
    saveConfig()
  })
}
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
        <button class="_button" :class="$style.sectionLabel" @click="toggleSection('provider')">
          <i class="ti ti-cloud" />
          プロバイダー
          <i class="ti ti-chevron-down" :class="[$style.chevron, { [$style.chevronOpen]: expandedSections.provider }]" />
        </button>
        <template v-if="expandedSections.provider">
          <div ref="providerDropdownRef" :class="$style.dropdown">
            <button
              class="_button"
              :class="$style.dropdownTrigger"
              @click="showProviderDropdown = !showProviderDropdown"
            >
              <i :class="'ti ' + currentProvider.icon" />
              <span>{{ currentProvider.label }}</span>
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
        </template>
      </div>

      <!-- Provider-specific fields (data-driven) -->
      <div v-for="field in currentFields" :key="field.key" :class="$style.section">
        <button class="_button" :class="$style.sectionLabel" @click="toggleSection(field.key)">
          <i :class="'ti ' + field.icon" />
          {{ field.label }}
          <i class="ti ti-chevron-down" :class="[$style.chevron, { [$style.chevronOpen]: expandedSections[field.key] }]" />
        </button>
        <template v-if="expandedSections[field.key]">
          <div v-if="field.secret" :class="$style.inputRow">
            <input
              v-model="currentSettings[field.key]"
              :class="$style.input"
              :type="showApiKey ? 'text' : 'password'"
              :placeholder="field.placeholder"
            />
            <button
              class="_button"
              :class="$style.visibilityBtn"
              @click="showApiKey = !showApiKey"
            >
              <i :class="showApiKey ? 'ti ti-eye-off' : 'ti ti-eye'" />
            </button>
          </div>
          <input
            v-else
            v-model="currentSettings[field.key]"
            :class="$style.input"
            type="text"
            :placeholder="field.placeholder"
          />
        </template>
      </div>

      <!-- Connection Test -->
      <div :class="$style.section">
        <button class="_button" :class="$style.sectionLabel" @click="toggleSection('test')">
          <i class="ti ti-plug-connected" />
          接続テスト
          <i class="ti ti-chevron-down" :class="[$style.chevron, { [$style.chevronOpen]: expandedSections.test }]" />
        </button>
        <template v-if="expandedSections.test">
          <button
            class="_button"
            :class="[$style.testBtn, { [$style.testing]: testStatus === 'testing' }]"
            :disabled="testStatus === 'testing'"
            @click="testConnection"
          >
            <i :class="testStatus === 'testing' ? 'ti ti-loader-2' : 'ti ti-plug-connected'" />
            {{ testStatus === 'testing' ? '接続テスト中...' : '接続テスト' }}
          </button>
          <div v-if="testStatus === 'ok'" :class="$style.codeSuccess">
            <i class="ti ti-check" />
            {{ testMessage }}
          </div>
          <div v-if="testStatus === 'error'" :class="$style.errorMessage">
            <i class="ti ti-alert-triangle" />
            {{ testMessage }}
          </div>
        </template>
      </div>
    </div>

    <!-- System Prompt Tab -->
    <div v-show="tab === 'prompt'" :class="$style.codePanel">
      <div :class="$style.codeHint">
        AIアシスタントに渡すカスタムシステムプロンプトをMarkdownで記述できます
      </div>
      <CodeEditor
        v-model="config.systemPrompt"
        :language="mdLang"
        :class="$style.codeEditorWrap"
      />
      <div :class="$style.promptStatus">
        <div v-if="config.systemPrompt.trim()" :class="$style.codeSuccess">
          <i class="ti ti-check" />
          {{ config.systemPrompt.length }} 文字
        </div>
        <button
          v-if="config.systemPrompt !== defaultConfig().systemPrompt"
          class="_button"
          :class="$style.codeApplyBtn"
          @click="config.systemPrompt = defaultConfig().systemPrompt"
        >
          <i class="ti ti-restore" />
          デフォルトに戻す
        </button>
      </div>
    </div>

    <!-- Actions -->
    <div :class="$style.actions">
      <div :class="$style.actionGroup">
        <button
          class="_button"
          :class="[$style.actionBtn, $style.secondary, { [$style.feedback]: importedMessage || importError }]"
          @click="importConfig"
        >
          <i class="ti" :class="importError ? 'ti-alert-circle' : 'ti-clipboard-text'" />
          {{ importError ? '無効' : importedMessage ? '読込済み' : 'インポート' }}
        </button>
        <button
          class="_button"
          :class="[$style.actionBtn, $style.secondary, { [$style.feedback]: copiedMessage }]"
          @click="exportConfig"
        >
          <i class="ti ti-clipboard-copy" />
          {{ copiedMessage ? 'コピー済み' : 'エクスポート' }}
        </button>
      </div>
      <button
        class="_button"
        :class="[$style.actionBtn, $style.danger, { [$style.confirming]: confirmingReset }]"
        @click="handleReset"
      >
        <i class="ti ti-trash" />
        {{ confirmingReset ? '本当にリセット？' : 'すべてリセット' }}
      </button>
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
.confirming { /* modifier */ }

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
  width: 100%;
  font-size: 0.8em;
  font-weight: bold;
  opacity: 0.7;
  cursor: pointer;
  transition: opacity var(--nd-duration-base);

  &:hover {
    opacity: 1;
  }
}

.chevron {
  margin-left: auto;
  font-size: 0.9em;
  transition: transform var(--nd-duration-base);
  transform: rotate(-90deg);
}

.chevronOpen {
  transform: rotate(0deg);
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

    i { animation: nd-spin 0.8s linear infinite; }
  }
}

.testing { /* modifier */ }

// ── Code tab (prompt) ──

.codePanel {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 10px;
  flex: 1;
  min-height: 0;
  overflow-y: auto;
}

.codeHint {
  font-size: 0.75em;
  opacity: 0.4;
}

.codeEditorWrap {
  flex: 1;
  min-height: 200px;
}

.promptStatus {
  display: flex;
  align-items: center;
  gap: 8px;
}

.codeApplyBtn { @include btn-secondary; }

.errorMessage {
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

.codeSuccess {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 0.75em;
  color: var(--nd-accent);
  opacity: 0.7;
}

// ── Actions ──

.actions { @include action-bar; }
.actionGroup { @include action-group; }

.actionBtn {
  &.secondary { @include btn-action; }
  &.danger { @include btn-danger-ghost; }
}

.secondary { /* modifier */ }
.feedback { /* modifier */ }
.danger { /* modifier */ }
</style>
