<script setup lang="ts">
import { computed, ref } from 'vue'
import {
  abortPlugin,
  getPluginLogs,
  launchPlugin,
  parsePluginMeta,
} from '@/aiscript/plugin-api'
import AiScriptEditor from '@/components/deck/widgets/AiScriptEditor.vue'
import { type PluginMeta, usePluginsStore } from '@/stores/plugins'

const pluginsStore = usePluginsStore()

// Views: 'list' | 'install' | 'detail'
const view = ref<'list' | 'install' | 'detail'>('list')
const installCode = ref('')
const installError = ref<string | null>(null)
const selectedPluginId = ref<string | null>(null)

const selectedPlugin = computed(() =>
  selectedPluginId.value
    ? pluginsStore.getPlugin(selectedPluginId.value)
    : undefined,
)

const selectedPluginLogs = computed(() =>
  selectedPluginId.value ? getPluginLogs(selectedPluginId.value) : [],
)

function showInstall() {
  installCode.value = ''
  installError.value = null
  view.value = 'install'
}

function showDetail(plugin: PluginMeta) {
  selectedPluginId.value = plugin.installId
  view.value = 'detail'
}

function backToList() {
  view.value = 'list'
  selectedPluginId.value = null
}

async function doInstall() {
  installError.value = null
  const code = installCode.value.trim()
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

  const plugin: PluginMeta = {
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

  pluginsStore.addPlugin(plugin)
  await launchPlugin(plugin)
  backToList()
}

async function toggleActive(plugin: PluginMeta) {
  const newActive = !plugin.active
  pluginsStore.setActive(plugin.installId, newActive)
  if (newActive) {
    await launchPlugin(plugin)
  } else {
    abortPlugin(plugin.installId)
  }
}

function uninstall(plugin: PluginMeta) {
  abortPlugin(plugin.installId)
  pluginsStore.removePlugin(plugin.installId)
  backToList()
}

function updateConfig(plugin: PluginMeta, key: string, value: unknown) {
  const newData = { ...plugin.configData, [key]: value }
  pluginsStore.updateConfigData(plugin.installId, newData)
}
</script>

<template>
  <div class="plugins-content">
    <!-- List view -->
    <template v-if="view === 'list'">
      <div class="plugins-header">
        <button class="plugins-install-btn" @click="showInstall">
          <i class="ti ti-plus" />
          インストール
        </button>
      </div>

      <div v-if="pluginsStore.plugins.length === 0" class="plugins-empty">
        <i class="ti ti-plug" />
        <p>プラグインがインストールされていません</p>
      </div>

      <div v-else class="plugins-list">
        <div
          v-for="plugin in pluginsStore.plugins"
          :key="plugin.installId"
          class="plugin-card"
          @click="showDetail(plugin)"
        >
          <div class="plugin-card-info">
            <div class="plugin-card-name">{{ plugin.name }}</div>
            <div class="plugin-card-meta">
              v{{ plugin.version }}
              <template v-if="plugin.author"> · {{ plugin.author }}</template>
            </div>
          </div>
          <button
            class="nd-toggle-switch"
            :class="{ on: plugin.active }"
            role="switch"
            :aria-checked="plugin.active"
            title="有効/無効"
            @click.stop="toggleActive(plugin)"
          >
            <span class="nd-toggle-switch-knob" />
          </button>
        </div>
      </div>
    </template>

    <!-- Install view -->
    <template v-if="view === 'install'">
      <div class="plugins-header">
        <button class="_button plugins-back-btn" @click="backToList">
          <i class="ti ti-arrow-left" />
        </button>
        <span class="plugins-header-title">プラグインをインストール</span>
      </div>

      <div class="install-body">
        <p class="install-hint">AiScriptプラグインコードを貼り付けてください</p>
        <AiScriptEditor
          v-model="installCode"
          placeholder="### { name: &quot;my-plugin&quot;, version: &quot;1.0&quot; } ..."
          max-height="none"
        />
        <div v-if="installError" class="install-error">
          <i class="ti ti-alert-circle" />
          {{ installError }}
        </div>
        <button class="plugins-install-btn install-submit" @click="doInstall">
          <i class="ti ti-download" />
          インストール
        </button>
      </div>
    </template>

    <!-- Detail view -->
    <template v-if="view === 'detail' && selectedPlugin">
      <div class="plugins-header">
        <button class="_button plugins-back-btn" @click="backToList">
          <i class="ti ti-arrow-left" />
        </button>
        <span class="plugins-header-title">{{ selectedPlugin.name }}</span>
      </div>

      <div class="detail-body">
        <div class="detail-meta">
          <div>Version: {{ selectedPlugin.version }}</div>
          <div v-if="selectedPlugin.author">Author: {{ selectedPlugin.author }}</div>
          <div v-if="selectedPlugin.description">{{ selectedPlugin.description }}</div>
        </div>

        <div class="detail-row">
          <span class="detail-row-label">有効</span>
          <button
            class="nd-toggle-switch"
            :class="{ on: selectedPlugin.active }"
            role="switch"
            :aria-checked="selectedPlugin.active"
            @click="toggleActive(selectedPlugin)"
          >
            <span class="nd-toggle-switch-knob" />
          </button>
        </div>

        <button class="detail-uninstall-btn" @click="uninstall(selectedPlugin)">
          <i class="ti ti-trash" />
          アンインストール
        </button>

        <!-- Config -->
        <template v-if="selectedPlugin.config && Object.keys(selectedPlugin.config).length > 0">
          <div class="detail-section-title">設定</div>
          <div class="detail-config">
            <div
              v-for="(def, key) in selectedPlugin.config"
              :key="key"
              class="config-item"
            >
              <label class="config-label">{{ def.label }}</label>
              <p v-if="def.description" class="config-desc">{{ def.description }}</p>
              <template v-if="def.type === 'boolean'">
                <button
                  class="nd-toggle-switch"
                  :class="{ on: !!selectedPlugin.configData[key] }"
                  role="switch"
                  :aria-checked="!!selectedPlugin.configData[key]"
                  @click="updateConfig(selectedPlugin, key, !selectedPlugin.configData[key])"
                >
                  <span class="nd-toggle-switch-knob" />
                </button>
              </template>
              <template v-else-if="def.type === 'string'">
                <input
                  class="config-input"
                  type="text"
                  :value="selectedPlugin.configData[key] as string"
                  @change="updateConfig(selectedPlugin, key, ($event.target as HTMLInputElement).value)"
                />
              </template>
              <template v-else-if="def.type === 'number'">
                <input
                  class="config-input"
                  type="number"
                  :value="selectedPlugin.configData[key] as number"
                  @change="updateConfig(selectedPlugin, key, Number(($event.target as HTMLInputElement).value))"
                />
              </template>
            </div>
          </div>
        </template>

        <!-- Logs -->
        <template v-if="selectedPluginLogs.length > 0">
          <div class="detail-section-title">ログ</div>
          <div class="detail-logs">
            <div
              v-for="(log, i) in selectedPluginLogs"
              :key="i"
              class="log-line"
              :class="{ error: log.isError }"
            >
              {{ log.text }}
            </div>
          </div>
        </template>
      </div>
    </template>
  </div>
</template>

<style scoped>
.plugins-content {
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  height: 100%;
  overflow-y: auto;
}

.plugins-header {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}

.plugins-header-title {
  font-weight: bold;
  font-size: 0.95em;
  color: var(--nd-fgHighlighted);
}

.plugins-back-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border-radius: 8px;
  color: var(--nd-fg);
  transition: background 0.15s;
}

.plugins-back-btn:hover {
  background: var(--nd-buttonHoverBg);
}

.plugins-install-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 14px;
  border: none;
  border-radius: 8px;
  background: var(--nd-accent);
  color: var(--nd-fgOnAccent, #fff);
  font-size: 0.85em;
  font-weight: bold;
  cursor: pointer;
  transition: opacity 0.15s;
  margin-left: auto;
}

.plugins-install-btn:hover {
  opacity: 0.85;
}

.plugins-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 40px 0;
  color: var(--nd-fg);
  opacity: 0.5;
}

.plugins-empty .ti {
  font-size: 2em;
}

.plugins-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.plugin-card {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  border-radius: 8px;
  cursor: pointer;
  transition: background 0.15s;
}

.plugin-card:hover {
  background: var(--nd-buttonHoverBg);
}

.plugin-card-info {
  flex: 1;
  min-width: 0;
}

.plugin-card-name {
  font-weight: bold;
  font-size: 0.9em;
  color: var(--nd-fgHighlighted);
}

.plugin-card-meta {
  font-size: 0.8em;
  color: var(--nd-fg);
  opacity: 0.6;
}

/* Install view */
.install-body {
  display: flex;
  flex-direction: column;
  gap: 8px;
  flex: 1;
}

.install-hint {
  font-size: 0.85em;
  color: var(--nd-fg);
  opacity: 0.7;
  margin: 0;
}


.install-error {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 10px;
  border-radius: 8px;
  background: rgba(255, 42, 42, 0.1);
  color: #ff2a2a;
  font-size: 0.85em;
}

.install-submit {
  align-self: flex-end;
}

/* Detail view */
.detail-body {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.detail-meta {
  font-size: 0.85em;
  color: var(--nd-fg);
  opacity: 0.7;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.detail-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 0;
}

.detail-row-label {
  font-size: 0.85em;
  font-weight: bold;
  color: var(--nd-fg);
}

.detail-uninstall-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  width: 100%;
  padding: 8px;
  border: none;
  border-radius: 8px;
  background: rgba(255, 42, 42, 0.1);
  color: #ff2a2a;
  font-size: 0.85em;
  font-weight: bold;
  cursor: pointer;
  transition: background 0.15s;
}

.detail-uninstall-btn:hover {
  background: rgba(255, 42, 42, 0.2);
}

.detail-section-title {
  font-weight: bold;
  font-size: 0.85em;
  color: var(--nd-fg);
  opacity: 0.7;
  margin-top: 4px;
}

.detail-config {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.config-item {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.config-label {
  font-size: 0.85em;
  font-weight: bold;
  color: var(--nd-fgHighlighted);
}

.config-desc {
  font-size: 0.8em;
  color: var(--nd-fg);
  opacity: 0.6;
  margin: 0;
}

.config-input {
  padding: 6px 10px;
  border: 1px solid var(--nd-divider);
  border-radius: 6px;
  background: var(--nd-inputBg, var(--nd-bg));
  color: var(--nd-fg);
  font-size: 0.85em;
}

.config-input:focus {
  outline: none;
  border-color: var(--nd-accent);
}

/* Logs */
.detail-logs {
  background: var(--nd-codeEditorBg, #1e1e1e);
  border-radius: 8px;
  padding: 8px;
  max-height: 200px;
  overflow-y: auto;
  font-family: monospace;
  font-size: 0.8em;
}

.log-line {
  color: var(--nd-fg);
  padding: 2px 4px;
  white-space: pre-wrap;
  word-break: break-all;
}

.log-line.error {
  color: #ff2a2a;
}
</style>
