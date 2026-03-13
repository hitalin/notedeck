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
import { useIsMobile } from '@/stores/ui'

const pluginsStore = usePluginsStore()
const isMobile = useIsMobile()

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
  <div :class="[$style.pluginsContent, { [$style.mobile]: isMobile }]">
    <!-- List view -->
    <template v-if="view === 'list'">
      <div :class="$style.pluginsHeader">
        <button :class="$style.pluginsInstallBtn" @click="showInstall">
          <i class="ti ti-plus" />
          インストール
        </button>
      </div>

      <div v-if="pluginsStore.plugins.length === 0" :class="$style.pluginsEmpty">
        <i class="ti ti-plug" />
        <p>プラグインがインストールされていません</p>
      </div>

      <div v-else :class="$style.pluginsList">
        <div
          v-for="plugin in pluginsStore.plugins"
          :key="plugin.installId"
          :class="$style.pluginCard"
          @click="showDetail(plugin)"
        >
          <div :class="$style.pluginCardInfo">
            <div :class="$style.pluginCardName">{{ plugin.name }}</div>
            <div :class="$style.pluginCardMeta">
              v{{ plugin.version }}
              <template v-if="plugin.author"> · {{ plugin.author }}</template>
            </div>
          </div>
          <button
            :class="[$style.ndToggleSwitch, { [$style.on]: plugin.active }]"
            role="switch"
            :aria-checked="plugin.active"
            title="有効/無効"
            @click.stop="toggleActive(plugin)"
          >
            <span :class="$style.ndToggleSwitchKnob" />
          </button>
        </div>
      </div>
    </template>

    <!-- Install view -->
    <template v-if="view === 'install'">
      <div :class="$style.pluginsHeader">
        <button class="_button" :class="$style.pluginsBackBtn" @click="backToList">
          <i class="ti ti-arrow-left" />
        </button>
        <span :class="$style.pluginsHeaderTitle">プラグインをインストール</span>
      </div>

      <div :class="$style.installBody">
        <p :class="$style.installHint">AiScriptプラグインコードを貼り付けてください</p>
        <AiScriptEditor
          v-model="installCode"
          placeholder="### { name: &quot;my-plugin&quot;, version: &quot;1.0&quot; } ..."
          max-height="none"
        />
        <div v-if="installError" :class="$style.installError">
          <i class="ti ti-alert-circle" />
          {{ installError }}
        </div>
        <button :class="[$style.pluginsInstallBtn, $style.installSubmit]" @click="doInstall">
          <i class="ti ti-download" />
          インストール
        </button>
      </div>
    </template>

    <!-- Detail view -->
    <template v-if="view === 'detail' && selectedPlugin">
      <div :class="$style.pluginsHeader">
        <button class="_button" :class="$style.pluginsBackBtn" @click="backToList">
          <i class="ti ti-arrow-left" />
        </button>
        <span :class="$style.pluginsHeaderTitle">{{ selectedPlugin.name }}</span>
      </div>

      <div :class="$style.detailBody">
        <div :class="$style.detailMeta">
          <div>バージョン: {{ selectedPlugin.version }}</div>
          <div v-if="selectedPlugin.author">作者: {{ selectedPlugin.author }}</div>
          <div v-if="selectedPlugin.description">{{ selectedPlugin.description }}</div>
        </div>

        <div :class="$style.detailRow">
          <span :class="$style.detailRowLabel">有効</span>
          <button
            :class="[$style.ndToggleSwitch, { [$style.on]: selectedPlugin.active }]"
            role="switch"
            :aria-checked="selectedPlugin.active"
            @click="toggleActive(selectedPlugin)"
          >
            <span :class="$style.ndToggleSwitchKnob" />
          </button>
        </div>

        <button :class="$style.detailUninstallBtn" @click="uninstall(selectedPlugin)">
          <i class="ti ti-trash" />
          アンインストール
        </button>

        <!-- Config -->
        <template v-if="selectedPlugin.config && Object.keys(selectedPlugin.config).length > 0">
          <div :class="$style.detailSectionTitle">設定</div>
          <div :class="$style.detailConfig">
            <div
              v-for="(def, key) in selectedPlugin.config"
              :key="key"
              :class="$style.configItem"
            >
              <label :class="$style.configLabel">{{ def.label }}</label>
              <p v-if="def.description" :class="$style.configDesc">{{ def.description }}</p>
              <template v-if="def.type === 'boolean'">
                <button
                  :class="[$style.ndToggleSwitch, { [$style.on]: !!selectedPlugin.configData[key] }]"
                  role="switch"
                  :aria-checked="!!selectedPlugin.configData[key]"
                  @click="updateConfig(selectedPlugin, key, !selectedPlugin.configData[key])"
                >
                  <span :class="$style.ndToggleSwitchKnob" />
                </button>
              </template>
              <template v-else-if="def.type === 'string'">
                <input
                  :class="$style.configInput"
                  type="text"
                  :value="selectedPlugin.configData[key] as string"
                  @change="updateConfig(selectedPlugin, key, ($event.target as HTMLInputElement).value)"
                />
              </template>
              <template v-else-if="def.type === 'number'">
                <input
                  :class="$style.configInput"
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
          <div :class="$style.detailSectionTitle">ログ</div>
          <div :class="$style.detailLogs">
            <div
              v-for="(log, i) in selectedPluginLogs"
              :key="i"
              :class="[$style.logLine, { [$style.error]: log.isError }]"
            >
              {{ log.text }}
            </div>
          </div>
        </template>
      </div>
    </template>
  </div>
</template>

<style lang="scss" module>
.pluginsContent {
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  height: 100%;
  overflow-y: auto;
}

.pluginsHeader {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}

.pluginsHeaderTitle {
  font-weight: bold;
  font-size: 0.95em;
  color: var(--nd-fgHighlighted);
}

.pluginsBackBtn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border-radius: var(--nd-radius-md);
  color: var(--nd-fg);
  transition: background var(--nd-duration-base);

  &:hover {
    background: var(--nd-buttonHoverBg);
  }
}

.pluginsInstallBtn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 14px;
  border: none;
  border-radius: var(--nd-radius-md);
  background: var(--nd-accent);
  color: var(--nd-fgOnAccent, #fff);
  font-size: 0.85em;
  font-weight: bold;
  cursor: pointer;
  transition: opacity var(--nd-duration-base);
  margin-left: auto;

  &:hover {
    opacity: 0.85;
  }
}

.pluginsEmpty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 40px 0;
  color: var(--nd-fg);
  opacity: 0.5;

  .ti {
    font-size: 2em;
  }
}

.pluginsList {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.pluginCard {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  border-radius: var(--nd-radius-md);
  cursor: pointer;
  transition: background var(--nd-duration-base);

  &:hover {
    background: var(--nd-buttonHoverBg);
  }
}

.pluginCardInfo {
  flex: 1;
  min-width: 0;
}

.pluginCardName {
  font-weight: bold;
  font-size: 0.9em;
  color: var(--nd-fgHighlighted);
}

.pluginCardMeta {
  font-size: 0.8em;
  color: var(--nd-fg);
  opacity: 0.6;
}

.ndToggleSwitch {
  /* placeholder for toggle switch styling - inherits from global */
}

.ndToggleSwitchKnob {
  /* placeholder for toggle switch knob styling - inherits from global */
}

.installBody {
  display: flex;
  flex-direction: column;
  gap: 8px;
  flex: 1;
}

.installHint {
  font-size: 0.85em;
  color: var(--nd-fg);
  opacity: 0.7;
  margin: 0;
}

.installError {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 10px;
  border-radius: var(--nd-radius-md);
  background: color-mix(in srgb, var(--nd-error) 10%, transparent);
  color: var(--nd-error);
  font-size: 0.85em;
}

.installSubmit {
  align-self: flex-end;
}

.detailBody {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.detailMeta {
  font-size: 0.85em;
  color: var(--nd-fg);
  opacity: 0.7;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.detailRow {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 0;
}

.detailRowLabel {
  font-size: 0.85em;
  font-weight: bold;
  color: var(--nd-fg);
}

.detailUninstallBtn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  width: 100%;
  padding: 8px;
  border: none;
  border-radius: var(--nd-radius-md);
  background: color-mix(in srgb, var(--nd-error) 10%, transparent);
  color: var(--nd-error);
  font-size: 0.85em;
  font-weight: bold;
  cursor: pointer;
  transition: background var(--nd-duration-base);

  &:hover {
    background: rgba(255, 42, 42, 0.2);
  }
}

.detailSectionTitle {
  font-weight: bold;
  font-size: 0.85em;
  color: var(--nd-fg);
  opacity: 0.7;
  margin-top: 4px;
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

  &.error {
    color: var(--nd-error);
  }
}

.mobile {
  padding: 8px;

  .pluginsBackBtn {
    width: 44px;
    height: 44px;
  }

  .pluginsInstallBtn {
    padding: 10px 16px;
    min-height: 44px;
  }

  .pluginCard {
    padding: 12px;
    min-height: 44px;
  }

  .detailUninstallBtn {
    padding: 12px;
    min-height: 44px;
  }

  .configInput {
    padding: 10px 12px;
    font-size: 1em;
    min-height: 44px;
  }
}

/* Empty placeholder classes for dynamic binding */
.on {}
.error {}
</style>
