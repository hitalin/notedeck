<script setup lang="ts">
import { json } from '@codemirror/lang-json'
import { type Diagnostic, linter } from '@codemirror/lint'
import JSON5 from 'json5'
import { computed, onMounted, reactive, ref, watch } from 'vue'
import EditorTabs from '@/components/common/EditorTabs.vue'
import CodeEditor from '@/components/deck/widgets/CodeEditor.vue'
import {
  type AiConfig,
  defaultConfig,
  deleteApiKey,
  getApiKeyStatus,
  PROVIDER_KEYS,
  type ProviderKey,
  type ProviderSettings,
  setApiKey,
  useAiConfig,
} from '@/composables/useAiConfig'
import { useClickOutside } from '@/composables/useClickOutside'
import { useClipboardFeedback } from '@/composables/useClipboardFeedback'
import { useDoubleConfirm } from '@/composables/useDoubleConfirm'
import { useEditorTabs } from '@/composables/useEditorTabs'
import { useWindowExternalFile } from '@/composables/useWindowExternalFile'
import { commands, unwrap } from '@/utils/tauriInvoke'

const jsonLang = json()

const json5Linter = linter(
  (view) => {
    const diagnostics: Diagnostic[] = []
    const src = view.state.doc.toString()
    if (!src.trim()) return diagnostics
    try {
      JSON5.parse(src)
    } catch (e) {
      diagnostics.push({
        from: 0,
        to: src.length,
        severity: 'error',
        message: e instanceof Error ? e.message : 'JSON5 パースエラー',
      })
    }
    return diagnostics
  },
  { delay: 400 },
)

const props = defineProps<{
  initialTab?: string
}>()

const { tab, containerRef: editorRef } = useEditorTabs(
  ['api', 'json'] as const,
  (props.initialTab as 'api' | 'json') ?? 'api',
)

useWindowExternalFile(() => ({ name: 'ai.json5' }))

// --- Provider schema (data-driven UI) ---

interface ProviderOption {
  value: ProviderKey
  label: string
  icon: string
  /** URL path appended to endpoint for connection test */
  testPath: string
  /** Whether this provider requires an API key for normal operation */
  needsApiKey: boolean
}

interface FieldDef {
  key: keyof ProviderSettings
  label: string
  icon: string
  placeholder: string
}

const PROVIDERS: ProviderOption[] = [
  {
    value: 'anthropic',
    label: 'Anthropic Claude',
    icon: 'ti-sparkles',
    testPath: '/v1/models',
    needsApiKey: true,
  },
  {
    value: 'openai',
    label: 'OpenAI ChatGPT',
    icon: 'ti-brand-openai',
    testPath: '/models',
    needsApiKey: true,
  },
  {
    value: 'custom',
    label: 'カスタム (OpenAI互換)',
    icon: 'ti-plug',
    testPath: '/models',
    needsApiKey: true,
  },
]

const PROVIDER_FIELDS: Record<ProviderKey, FieldDef[]> = {
  anthropic: [
    {
      key: 'endpoint',
      label: 'エンドポイント',
      icon: 'ti-link',
      placeholder: 'https://api.anthropic.com',
    },
    {
      key: 'model',
      label: 'モデル',
      icon: 'ti-cube',
      placeholder: 'claude-opus-4-7, claude-sonnet-4-6, etc.',
    },
  ],
  openai: [
    {
      key: 'endpoint',
      label: 'エンドポイント',
      icon: 'ti-link',
      placeholder: 'https://api.openai.com/v1',
    },
    {
      key: 'model',
      label: 'モデル',
      icon: 'ti-cube',
      placeholder: 'gpt-4o, gpt-4o-mini, etc.',
    },
  ],
  custom: [
    {
      key: 'endpoint',
      label: 'エンドポイント',
      icon: 'ti-link',
      placeholder: 'https://openrouter.ai/api/v1 など (OpenAI 互換)',
    },
    {
      key: 'model',
      label: 'モデル',
      icon: 'ti-cube',
      placeholder: 'anthropic/claude-sonnet-4 など',
    },
  ],
}

// --- Config (delegated to composable) ---

const { config, save: saveConfig, mergeConfig } = useAiConfig()

const expandedSections = reactive<Record<string, boolean>>({ provider: true })

function toggleSection(key: string) {
  expandedSections[key] = !expandedSections[key]
}

let saveTimer: ReturnType<typeof setTimeout> | null = null
watch(
  config,
  () => {
    if (saveTimer) clearTimeout(saveTimer)
    saveTimer = setTimeout(() => {
      saveConfig()
      // form 経由保存後、JSON タブの表示も最新化する
      rawJson.value = formatRaw(config.value)
    }, 300)
  },
  { deep: true },
)

// --- JSON5 raw editor (ai.json5) ---

const rawJson = ref<string>('')
const rawError = ref<string | null>(null)
const rawSaved = ref(false)
let rawSyncing = false

function formatRaw(c: AiConfig): string {
  return `${JSON5.stringify(c, null, 2)}\n`
}

// 初期化: config が読み込まれたら raw も初期化
watch(
  () => config.value,
  (c) => {
    if (rawSyncing) return
    rawJson.value = formatRaw(c)
  },
  { immediate: true },
)

let rawSaveTimer: ReturnType<typeof setTimeout> | null = null
watch(rawJson, (v) => {
  if (tab.value !== 'json') return
  if (rawSaveTimer) clearTimeout(rawSaveTimer)
  rawSaveTimer = setTimeout(() => {
    try {
      const parsed = JSON5.parse(v) as Partial<AiConfig>
      rawSyncing = true
      config.value = mergeConfig(defaultConfig(), parsed)
      rawSyncing = false
      rawError.value = null
      rawSaved.value = true
      setTimeout(() => {
        rawSaved.value = false
      }, 1500)
    } catch (e) {
      rawError.value = e instanceof Error ? e.message : '不正な JSON5'
    }
  }, 500)
})

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

// --- API key (keychain) ---

const apiKeyStatus = reactive<Record<ProviderKey, boolean>>({
  anthropic: false,
  openai: false,
  custom: false,
})
const editingKey = ref<ProviderKey | null>(null)
const draftKey = ref('')
const showDraftKey = ref(false)

async function refreshApiKeyStatus(provider: ProviderKey) {
  try {
    apiKeyStatus[provider] = await getApiKeyStatus(provider)
  } catch (e) {
    console.warn(
      `[ai-settings] failed to read keychain status for ${provider}:`,
      e,
    )
    apiKeyStatus[provider] = false
  }
}

async function refreshAllStatuses() {
  await Promise.all(PROVIDER_KEYS.map(refreshApiKeyStatus))
}

onMounted(refreshAllStatuses)

// プロバイダー切替時に編集モードをリセット
watch(
  () => config.value.provider,
  () => {
    editingKey.value = null
    draftKey.value = ''
    showDraftKey.value = false
  },
)

function startEdit(provider: ProviderKey) {
  editingKey.value = provider
  draftKey.value = ''
  showDraftKey.value = false
  expandedSections.apiKey = true
}

function cancelEdit() {
  editingKey.value = null
  draftKey.value = ''
  showDraftKey.value = false
}

async function saveDraftKey(provider: ProviderKey) {
  if (!draftKey.value) {
    cancelEdit()
    return
  }
  await setApiKey(provider, draftKey.value)
  draftKey.value = ''
  editingKey.value = null
  showDraftKey.value = false
  await refreshApiKeyStatus(provider)
}

async function clearKey(provider: ProviderKey) {
  await deleteApiKey(provider)
  await refreshApiKeyStatus(provider)
}

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

    // For test purposes, prefer the draft key (currently being entered) over
    // the stored one — the keychain key body is intentionally not exposed.
    // Tests with no draft key run unauthenticated; this fails for providers
    // requiring auth, which surfaces "set a key first" naturally.
    const testKey = editingKey.value === provider.value ? draftKey.value : ''

    const result = unwrap(
      await commands.checkEndpointHealth(url, testKey || null),
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
  navigator.clipboard.writeText(JSON.stringify(config.value, null, 2))
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
    config.value = mergeConfig(defaultConfig(), parsed as Partial<AiConfig>)
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
        { value: 'json', icon: 'braces', label: 'ai.json5' },
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

      <!-- Provider-specific fields (data-driven, plain text only) -->
      <div v-for="field in currentFields" :key="field.key" :class="$style.section">
        <button class="_button" :class="$style.sectionLabel" @click="toggleSection(field.key)">
          <i :class="'ti ' + field.icon" />
          {{ field.label }}
          <i class="ti ti-chevron-down" :class="[$style.chevron, { [$style.chevronOpen]: expandedSections[field.key] }]" />
        </button>
        <template v-if="expandedSections[field.key]">
          <input
            v-model="currentSettings[field.key]"
            :class="$style.input"
            type="text"
            :placeholder="field.placeholder"
          />
        </template>
      </div>

      <!-- API Key (keychain — body never exposed to frontend) -->
      <div v-if="currentProvider.needsApiKey" :class="$style.section">
        <button class="_button" :class="$style.sectionLabel" @click="toggleSection('apiKey')">
          <i class="ti ti-key" />
          APIキー
          <span :class="$style.statusBadge">
            <i v-if="apiKeyStatus[currentProvider.value]" class="ti ti-shield-check" :class="$style.badgeOk" />
            <i v-else class="ti ti-shield-off" :class="$style.badgeNone" />
            {{ apiKeyStatus[currentProvider.value] ? '設定済み' : '未設定' }}
          </span>
          <i class="ti ti-chevron-down" :class="[$style.chevron, { [$style.chevronOpen]: expandedSections.apiKey }]" />
        </button>
        <template v-if="expandedSections.apiKey">
          <div :class="$style.keyHint">
            <i class="ti ti-lock" />
            キーは OS のキーチェーンに保管されます (DevTools / ファイルから取得不可)
          </div>
          <!-- Edit mode -->
          <template v-if="editingKey === currentProvider.value">
            <div :class="$style.inputRow">
              <input
                v-model="draftKey"
                :class="$style.input"
                :type="showDraftKey ? 'text' : 'password'"
                placeholder="新しい API キーを入力"
                @keydown.enter="saveDraftKey(currentProvider.value)"
                @keydown.esc="cancelEdit"
              />
              <button
                class="_button"
                :class="$style.visibilityBtn"
                @click="showDraftKey = !showDraftKey"
              >
                <i :class="showDraftKey ? 'ti ti-eye-off' : 'ti ti-eye'" />
              </button>
            </div>
            <div :class="$style.keyActions">
              <button
                class="_button"
                :class="[$style.keyBtn, $style.primary]"
                :disabled="!draftKey"
                @click="saveDraftKey(currentProvider.value)"
              >
                <i class="ti ti-check" />
                保存
              </button>
              <button class="_button" :class="$style.keyBtn" @click="cancelEdit">
                <i class="ti ti-x" />
                キャンセル
              </button>
            </div>
          </template>
          <!-- Status mode: show "クリア" if set, otherwise "キーを入力" -->
          <template v-else>
            <div :class="$style.keyActions">
              <button
                v-if="apiKeyStatus[currentProvider.value]"
                class="_button"
                :class="[$style.keyBtn, $style.danger]"
                @click="clearKey(currentProvider.value)"
              >
                <i class="ti ti-trash" />
                クリア
              </button>
              <button
                v-else
                class="_button"
                :class="$style.keyBtn"
                @click="startEdit(currentProvider.value)"
              >
                <i class="ti ti-pencil" />
                キーを入力
              </button>
            </div>
          </template>
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

    <!-- ai.json5 raw editor tab -->
    <div v-show="tab === 'json'" :class="$style.codePanel">
      <div :class="$style.codeHint">
        ai.json5 を直接編集できます。API キーはキーチェーン管理のため raw には現れません。
      </div>
      <CodeEditor
        v-model="rawJson"
        :language="jsonLang"
        :linter="json5Linter"
        :class="$style.codeEditorWrap"
        auto-height
      />
      <div :class="$style.promptStatus">
        <div v-if="rawError" :class="$style.errorMessage">
          <i class="ti ti-alert-triangle" />
          {{ rawError }}
        </div>
        <div v-else-if="rawSaved" :class="$style.codeSuccess">
          <i class="ti ti-check" />
          保存しました
        </div>
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

.statusBadge {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  margin-left: 6px;
  padding: 2px 6px;
  border-radius: var(--nd-radius-sm);
  background: color-mix(in srgb, var(--nd-fg) 8%, transparent);
  font-size: 0.85em;
  font-weight: normal;
  opacity: 0.9;
}

.badgeOk { color: var(--nd-accent); }
.badgeNone { color: var(--nd-fg); opacity: 0.5; }

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

.keyHint {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 0.7em;
  opacity: 0.5;
}

.keyActions {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}

.keyBtn {
  @include btn-secondary;

  &.primary { @include btn-primary; }
  &.danger { @include btn-danger-ghost; }
}

.primary { /* modifier */ }

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
