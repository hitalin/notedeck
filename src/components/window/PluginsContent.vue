<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import {
  abortPlugin,
  getPluginLogs,
  launchPlugin,
  parsePluginMeta,
} from '@/aiscript/plugin-api'
import EditorTabs from '@/components/common/EditorTabs.vue'
import AiScriptEditor from '@/components/deck/widgets/AiScriptEditor.vue'
import { useClipboardFeedback } from '@/composables/useClipboardFeedback'
import { useDoubleConfirm } from '@/composables/useDoubleConfirm'
import { useEditorTabs } from '@/composables/useEditorTabs'
import { type PluginMeta, usePluginsStore } from '@/stores/plugins'

const props = defineProps<{
  initialPluginId?: string
  initialTab?: string
}>()

const pluginsStore = usePluginsStore()

const { tab, containerRef: editorRef } = useEditorTabs(
  ['visual', 'code'] as const,
  (props.initialTab as 'visual' | 'code') ?? 'visual',
)

// 編集中プラグイン
const editingPluginId = ref(props.initialPluginId ?? null)

const plugin = computed(() =>
  editingPluginId.value
    ? pluginsStore.getPlugin(editingPluginId.value)
    : undefined,
)

const pluginLogs = computed(() =>
  editingPluginId.value ? getPluginLogs(editingPluginId.value) : [],
)

// 新規インストールモード (initialPluginId が無い場合)
const isNewInstall = computed(() => !plugin.value)

// コード編集
const editingCode = ref('')
const codeModified = ref(false)

// 初期コードをセット
function initCode() {
  if (plugin.value) {
    editingCode.value = plugin.value.src
  } else {
    editingCode.value = ''
  }
  codeModified.value = false
}
initCode()

watch(editingCode, (val) => {
  if (plugin.value) {
    codeModified.value = val !== plugin.value.src
  }
})

// タブ切り替え時にコードを同期
watch(tab, (t) => {
  if (t === 'code' && plugin.value) {
    editingCode.value = plugin.value.src
    codeModified.value = false
  }
})

async function saveCode() {
  if (!plugin.value) return
  pluginsStore.updateSrc(plugin.value.installId, editingCode.value)
  codeModified.value = false

  if (plugin.value.active) {
    abortPlugin(plugin.value.installId)
    await launchPlugin({ ...plugin.value, src: editingCode.value })
  }
}

// 新規インストール
const installError = ref<string | null>(null)

async function doInstall() {
  installError.value = null
  const code = editingCode.value.trim()
  if (!code) {
    installError.value = 'コードを入力してください'
    return
  }

  const meta = parsePluginMeta(code)
  if (!meta) {
    installError.value =
      'プラグインメタデータが見つかりません。### { name: "...", version: "..." } ヘッダーが必要です'
    return
  }

  if (pluginsStore.isDuplicate(meta.name)) {
    installError.value = `"${meta.name}" は既にインストールされています`
    return
  }

  const configData: Record<string, unknown> = {}
  if (meta.config) {
    for (const [key, def] of Object.entries(meta.config)) {
      configData[key] = def.default
    }
  }

  const newPlugin: PluginMeta = {
    installId: `p-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    name: meta.name,
    version: meta.version,
    author: meta.author,
    description: meta.description,
    permissions: meta.permissions,
    config: meta.config,
    configData,
    src: code,
    active: true,
  }

  pluginsStore.addPlugin(newPlugin)
  await launchPlugin(newPlugin)

  // インストール後は既存プラグインエディタモードに切り替え
  editingPluginId.value = newPlugin.installId
  tab.value = 'visual'
}

// 有効/無効
async function toggleActive() {
  if (!plugin.value) return
  const newActive = !plugin.value.active
  pluginsStore.setActive(plugin.value.installId, newActive)
  if (newActive) {
    await launchPlugin(plugin.value)
  } else {
    abortPlugin(plugin.value.installId)
  }
}

// 設定
function updateConfig(key: string, value: unknown) {
  if (!plugin.value) return
  const newData = { ...plugin.value.configData, [key]: value }
  pluginsStore.updateConfigData(plugin.value.installId, newData)
}

// Clipboard
const {
  copied: copiedMessage,
  imported: importedMessage,
  importError: importClipError,
  copyToClipboard,
  readFromClipboard,
  showImported,
  showImportError,
} = useClipboardFeedback()

async function exportPlugin() {
  if (!plugin.value) return
  await copyToClipboard(plugin.value.src)
}

async function importPlugin() {
  const text = await readFromClipboard()
  if (!text?.trim()) {
    showImportError()
    return
  }
  editingCode.value = text
  tab.value = 'code'
  showImported()
}

// Double confirm for uninstall
const { confirming: confirmingUninstall, trigger: triggerUninstall } =
  useDoubleConfirm()

function handleUninstall() {
  if (!plugin.value) return
  const p = plugin.value
  triggerUninstall(() => {
    abortPlugin(p.installId)
    pluginsStore.removePlugin(p.installId)
  })
}

// Expanded sections (accordion pattern)
const expandedSections: Record<string, boolean> = { active: true }

function toggleSection(key: string) {
  expandedSections[key] = !expandedSections[key]
}
</script>

<template>
  <div ref="editorRef" :class="$style.pluginsContent">
    <EditorTabs
      v-model="tab"
      :tabs="[
        { value: 'visual', icon: 'plug', label: 'ビジュアル' },
        { value: 'code', icon: 'code', label: 'コード' },
      ]"
    />

    <!-- Visual tab -->
    <div v-show="tab === 'visual'" :class="$style.visualPanel">
      <!-- 既存プラグイン編集 -->
      <template v-if="plugin">
        <div :class="$style.detailMeta">
          <div :class="$style.detailName">{{ plugin.name }}</div>
          <div>
            v{{ plugin.version }}
            <template v-if="plugin.author"> · {{ plugin.author }}</template>
          </div>
          <div v-if="plugin.description">{{ plugin.description }}</div>
        </div>

        <!-- 有効/無効 -->
        <div :class="$style.section">
          <button class="_button" :class="$style.sectionHeader" @click="toggleSection('active')">
            <i class="ti ti-power" />
            有効
            <i class="ti ti-chevron-down" :class="[$style.chevron, { [$style.chevronOpen]: expandedSections.active !== false }]" />
          </button>
          <template v-if="expandedSections.active !== false">
            <div :class="$style.detailRow">
              <span :class="$style.detailRowLabel">プラグインを有効にする</span>
              <button
                :class="[$style.ndToggleSwitch, { [$style.on]: plugin.active }]"
                role="switch"
                :aria-checked="plugin.active"
                @click="toggleActive"
              >
                <span :class="$style.ndToggleSwitchKnob" />
              </button>
            </div>
          </template>
        </div>

        <!-- Config -->
        <template v-if="plugin.config && Object.keys(plugin.config).length > 0">
          <div :class="$style.section">
            <button class="_button" :class="$style.sectionHeader" @click="toggleSection('config')">
              <i class="ti ti-settings" />
              設定
              <i class="ti ti-chevron-down" :class="[$style.chevron, { [$style.chevronOpen]: expandedSections.config }]" />
            </button>
            <template v-if="expandedSections.config">
              <div :class="$style.detailConfig">
                <div
                  v-for="(def, key) in plugin.config"
                  :key="key"
                  :class="$style.configItem"
                >
                  <label :class="$style.configLabel">{{ def.label }}</label>
                  <p v-if="def.description" :class="$style.configDesc">{{ def.description }}</p>
                  <template v-if="def.type === 'boolean'">
                    <button
                      :class="[$style.ndToggleSwitch, { [$style.on]: !!plugin.configData[key] }]"
                      role="switch"
                      :aria-checked="!!plugin.configData[key]"
                      @click="updateConfig(key, !plugin.configData[key])"
                    >
                      <span :class="$style.ndToggleSwitchKnob" />
                    </button>
                  </template>
                  <template v-else-if="def.type === 'string'">
                    <input
                      :class="$style.configInput"
                      type="text"
                      :value="plugin.configData[key] as string"
                      @change="updateConfig(key, ($event.target as HTMLInputElement).value)"
                    />
                  </template>
                  <template v-else-if="def.type === 'number'">
                    <input
                      :class="$style.configInput"
                      type="number"
                      :value="plugin.configData[key] as number"
                      @change="updateConfig(key, Number(($event.target as HTMLInputElement).value))"
                    />
                  </template>
                </div>
              </div>
            </template>
          </div>
        </template>

        <!-- Logs -->
        <template v-if="pluginLogs.length > 0">
          <div :class="$style.section">
            <button class="_button" :class="$style.sectionHeader" @click="toggleSection('logs')">
              <i class="ti ti-list" />
              ログ
              <i class="ti ti-chevron-down" :class="[$style.chevron, { [$style.chevronOpen]: expandedSections.logs }]" />
            </button>
            <template v-if="expandedSections.logs">
              <div :class="$style.detailLogs">
                <div
                  v-for="(log, i) in pluginLogs"
                  :key="i"
                  :class="[$style.logLine, { [$style.logError]: log.isError }]"
                >
                  {{ log.text }}
                </div>
              </div>
            </template>
          </div>
        </template>
      </template>

      <!-- 新規インストール -->
      <template v-else>
        <div :class="$style.installBody">
          <p :class="$style.installHint">AiScriptプラグインコードを貼り付けてインストール</p>
          <div v-if="installError" :class="$style.errorMessage">
            <i class="ti ti-alert-circle" />
            {{ installError }}
          </div>
        </div>
      </template>
    </div>

    <!-- Code tab -->
    <div v-show="tab === 'code'" :class="$style.codePanel">
      <AiScriptEditor
        v-model="editingCode"
        :placeholder="isNewInstall ? '### { name: &quot;my-plugin&quot;, version: &quot;1.0&quot; } ...' : ''"
        :class="$style.codeEditorWrap"
      />
      <div v-if="installError && isNewInstall" :class="$style.errorMessage">
        <i class="ti ti-alert-circle" />
        {{ installError }}
      </div>
    </div>

    <!-- Actions -->
    <div :class="$style.actions">
      <template v-if="plugin">
        <div :class="$style.actionGroup">
          <button
            class="_button"
            :class="[$style.actionBtn, $style.secondary, { [$style.feedback]: importedMessage || importClipError }]"
            @click="importPlugin"
          >
            <i class="ti" :class="importClipError ? 'ti-alert-circle' : 'ti-clipboard-text'" />
            {{ importClipError ? '無効' : importedMessage ? '読込済み' : 'インポート' }}
          </button>
          <button
            class="_button"
            :class="[$style.actionBtn, $style.secondary, { [$style.feedback]: copiedMessage }]"
            @click="exportPlugin"
          >
            <i class="ti ti-clipboard-copy" />
            {{ copiedMessage ? 'コピー済み' : 'エクスポート' }}
          </button>
        </div>
        <button
          v-if="codeModified"
          class="_button"
          :class="[$style.actionBtn, $style.primary]"
          @click="saveCode"
        >
          <i class="ti ti-device-floppy" />
          保存して再起動
        </button>
        <button
          class="_button"
          :class="[$style.actionBtn, $style.danger, { [$style.confirming]: confirmingUninstall }]"
          @click="handleUninstall"
        >
          <i class="ti ti-trash" />
          {{ confirmingUninstall ? '本当にアンインストール？' : 'アンインストール' }}
        </button>
      </template>
      <template v-else>
        <button
          class="_button"
          :class="[$style.actionBtn, $style.primary, $style.full]"
          @click="doInstall"
        >
          <i class="ti ti-download" />
          インストール
        </button>
      </template>
    </div>
  </div>
</template>

<style lang="scss" module>
@use '@/styles/buttons' as *;

.pluginsContent {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
  overflow: hidden;
}

.visualPanel {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  scrollbar-color: var(--nd-scrollbarHandle) transparent;
  scrollbar-width: thin;
}

.detailMeta {
  font-size: 0.85em;
  color: var(--nd-fg);
  opacity: 0.7;
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 12px 10px 4px;
}

.detailName {
  font-weight: bold;
  font-size: 1.1em;
  color: var(--nd-fgHighlighted);
  opacity: 1;
}

.section {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px 10px;
  border-bottom: 1px solid var(--nd-divider);
}

.sectionHeader {
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

.detailRow {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 4px 0;
}

.detailRowLabel {
  font-size: 0.85em;
  color: var(--nd-fg);
}

.detailConfig {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.configItem {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.configLabel {
  font-size: 0.85em;
  font-weight: bold;
  color: var(--nd-fgHighlighted);
}

.configDesc {
  font-size: 0.8em;
  color: var(--nd-fg);
  opacity: 0.6;
  margin: 0;
}

.configInput {
  padding: 6px 10px;
  border: 1px solid var(--nd-divider);
  border-radius: var(--nd-radius-sm);
  background: var(--nd-inputBg, var(--nd-bg));
  color: var(--nd-fg);
  font-size: 0.85em;

  &:focus {
    outline: none;
    border-color: var(--nd-accent);
  }
}

.detailLogs {
  background: var(--nd-codeEditorBg, #1e1e1e);
  border-radius: var(--nd-radius-md);
  padding: 8px;
  max-height: 200px;
  overflow-y: auto;
  font-family: monospace;
  font-size: 0.8em;
}

.logLine {
  color: var(--nd-fg);
  padding: 2px 4px;
  white-space: pre-wrap;
  word-break: break-all;

  &.logError {
    color: var(--nd-love);
  }
}

.installBody {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px 10px;
  flex: 1;
}

.installHint {
  font-size: 0.85em;
  color: var(--nd-fg);
  opacity: 0.5;
  margin: 0;
}

.errorMessage {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 10px;
  border-radius: var(--nd-radius-sm);
  background: color-mix(in srgb, var(--nd-love) 10%, transparent);
  color: var(--nd-love);
  font-size: 0.85em;
}

.codePanel {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 10px;
  flex: 1;
  min-height: 0;
  overflow-y: auto;
}

.codeEditorWrap {
  flex: 1;
  min-height: 200px;
}

.actions { @include action-bar; }
.actionGroup { @include action-group; }

.actionBtn {
  &.secondary { @include btn-action; }
  &.danger { @include btn-danger-ghost; }
  &.primary { @include btn-primary; }
  &.full { width: 100%; }
}

.ndToggleSwitch {
  /* placeholder — inherits from global */
}

.ndToggleSwitchKnob {
  /* placeholder — inherits from global */
}

/* Empty placeholder classes for dynamic binding */
.on {}
.secondary {}
.feedback {}
.danger {}
.confirming {}
.primary {}
.full {}
</style>
