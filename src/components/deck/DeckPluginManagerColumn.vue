<script setup lang="ts">
import { computed, ref } from 'vue'
import { abortPlugin, launchPlugin } from '@/aiscript/plugin-api'
import { useDoubleConfirm } from '@/composables/useDoubleConfirm'
import type { DeckColumn as DeckColumnType } from '@/stores/deck'
import { type PluginMeta, usePluginsStore } from '@/stores/plugins'
import { useWindowsStore } from '@/stores/windows'
import DeckColumn from './DeckColumn.vue'

const props = defineProps<{
  column: DeckColumnType
}>()

const pluginsStore = usePluginsStore()
const windowsStore = useWindowsStore()

pluginsStore.ensureLoaded()

// --- Search & filter ---
const searchQuery = ref('')

type FilterMode = 'all' | 'enabled' | 'disabled'
const activeFilter = computed<FilterMode>(() => {
  const q = searchQuery.value.trimStart()
  if (q.startsWith('@enabled')) return 'enabled'
  if (q.startsWith('@disabled')) return 'disabled'
  if (q.startsWith('@installed')) return 'all'
  return 'all'
})

const textQuery = computed(() => {
  return searchQuery.value
    .replace(/^@(?:installed|enabled|disabled)\s*/, '')
    .trim()
    .toLowerCase()
})

const filteredPlugins = computed(() => {
  let list = pluginsStore.plugins
  if (activeFilter.value === 'enabled') {
    list = list.filter((p) => p.active)
  } else if (activeFilter.value === 'disabled') {
    list = list.filter((p) => !p.active)
  }
  const q = textQuery.value
  if (q) {
    list = list.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        (p.description?.toLowerCase().includes(q) ?? false) ||
        (p.author?.toLowerCase().includes(q) ?? false),
    )
  }
  return list
})

const enabledCount = computed(
  () => pluginsStore.plugins.filter((p) => p.active).length,
)
const disabledCount = computed(
  () => pluginsStore.plugins.filter((p) => !p.active).length,
)

function setFilter(mode: FilterMode) {
  const prefix =
    mode === 'enabled'
      ? '@enabled '
      : mode === 'disabled'
        ? '@disabled '
        : '@installed '
  searchQuery.value = prefix
}

// --- Actions ---
async function toggleActive(plugin: PluginMeta) {
  const newActive = !plugin.active
  pluginsStore.setActive(plugin.installId, newActive)
  if (newActive) {
    await launchPlugin(plugin)
  } else {
    abortPlugin(plugin.installId)
  }
}

function openPluginDetail(pluginId: string) {
  windowsStore.open('plugins', { initialPluginId: pluginId })
}

function openNewPlugin() {
  windowsStore.open('plugins', {})
}

// --- Uninstall (per-card double confirm) ---
const confirmingUninstallId = ref<string | null>(null)
const { confirming: confirmingUninstall, trigger: triggerUninstall } =
  useDoubleConfirm()

function handleUninstall(plugin: PluginMeta) {
  confirmingUninstallId.value = plugin.installId
  triggerUninstall(() => {
    abortPlugin(plugin.installId)
    pluginsStore.removePlugin(plugin.installId)
    confirmingUninstallId.value = null
  })
}
</script>

<template>
  <DeckColumn
    :column-id="column.id"
    :title="column.name ?? 'プラグイン'"
    @header-click="() => {}"
  >
    <template #header-icon>
      <i class="ti ti-puzzle" :class="$style.headerIcon" />
    </template>

    <template #header-meta>
      <button
        class="_button"
        :class="$style.headerBtn"
        title="新規プラグインをインストール"
        @click.stop="openNewPlugin"
      >
        <i class="ti ti-plus" />
      </button>
    </template>

    <template #header-extra>
      <div :class="$style.searchWrap">
        <input
          v-model="searchQuery"
          :class="$style.searchInput"
          type="text"
          placeholder="プラグインを検索..."
        />
        <div :class="$style.searchActions">
          <button
            class="_button"
            :class="[$style.filterBtn, activeFilter === 'enabled' && $style.filterBtnActive]"
            title="有効なプラグイン (@enabled)"
            @click="setFilter('enabled')"
          >
            <i class="ti ti-check" />
          </button>
          <button
            class="_button"
            :class="[$style.filterBtn, activeFilter === 'disabled' && $style.filterBtnActive]"
            title="無効なプラグイン (@disabled)"
            @click="setFilter('disabled')"
          >
            <i class="ti ti-circle-off" />
          </button>
        </div>
      </div>
    </template>

    <div :class="$style.wrapper">
      <!-- Section header -->
      <div :class="$style.sectionHeader">
        <span :class="$style.sectionTitle">
          {{
            activeFilter === 'enabled' ? '有効' : activeFilter === 'disabled' ? '無効' : 'インストール済み'
          }}
        </span>
        <span :class="$style.sectionCount">{{ filteredPlugins.length }}</span>
        <span v-if="activeFilter === 'all'" :class="$style.sectionSub">
          ({{ enabledCount }} 有効, {{ disabledCount }} 無効)
        </span>
      </div>

      <!-- Plugin list -->
      <div :class="$style.list">
        <div
          v-for="plugin in filteredPlugins"
          :key="plugin.installId"
          :class="[$style.card, !plugin.active && $style.cardDisabled]"
          @click="openPluginDetail(plugin.installId)"
        >
          <!-- Icon -->
          <div :class="$style.cardIcon">
            <i class="ti ti-puzzle" />
          </div>

          <!-- Body -->
          <div :class="$style.cardBody">
            <div :class="$style.cardRow1">
              <span :class="$style.cardName">{{ plugin.name }}</span>
            </div>
            <div :class="$style.cardRow2">
              {{ plugin.description || 'No description' }}
            </div>
            <div :class="$style.cardRow3">
              <span v-if="plugin.author" :class="$style.cardAuthor">{{ plugin.author }}</span>
              <span :class="$style.cardVersion">v{{ plugin.version }}</span>
              <span :class="$style.cardSpacer" />
              <button
                class="_button"
                :class="[$style.cardActionBtn, plugin.active ? $style.disableBtn : $style.enableBtn]"
                :title="plugin.active ? '無効にする' : '有効にする'"
                @click.stop="toggleActive(plugin)"
              >
                {{ plugin.active ? '無効にする' : '有効にする' }}
              </button>
              <button
                class="_button"
                :class="[
                  $style.uninstallBtn,
                  confirmingUninstallId === plugin.installId && confirmingUninstall && $style.uninstallBtnConfirm,
                ]"
                :title="confirmingUninstallId === plugin.installId && confirmingUninstall ? '本当にアンインストール？' : 'アンインストール'"
                @click.stop="handleUninstall(plugin)"
              >
                <i class="ti ti-trash" />
              </button>
              <button
                class="_button"
                :class="$style.gearBtn"
                title="プラグイン設定"
                @click.stop="openPluginDetail(plugin.installId)"
              >
                <i class="ti ti-settings" />
              </button>
            </div>
          </div>
        </div>

        <!-- Empty state -->
        <div v-if="filteredPlugins.length === 0" :class="$style.empty">
          <template v-if="textQuery || activeFilter !== 'all'">
            一致するプラグインがありません
          </template>
          <template v-else>
            <i class="ti ti-puzzle" :class="$style.emptyIcon" />
            <span>プラグインがインストールされていません</span>
            <button class="_button" :class="$style.installLink" @click="openNewPlugin">
              プラグインをインストール...
            </button>
          </template>
        </div>
      </div>
    </div>
  </DeckColumn>
</template>

<style module lang="scss">
@use './column-common.module.scss';

.headerIcon {
  font-size: 1em;
}

.headerBtn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border-radius: var(--nd-radius-sm);
  color: var(--nd-fg);
  opacity: 0.6;
  transition:
    background 0.1s,
    opacity 0.1s;

  &:hover {
    background: var(--nd-buttonHoverBg);
    opacity: 1;
  }
}

// --- Search bar ---
.searchWrap {
  display: flex;
  align-items: center;
  padding: 8px 10px 4px;
  width: 100%;
}

.searchInput {
  flex: 1;
  min-width: 0;
  height: 26px;
  padding: 0 6px;
  border: 1px solid var(--nd-divider);
  border-radius: 2px;
  background: var(--nd-inputBg, var(--nd-bg));
  color: var(--nd-fg);
  font-size: 12px;

  &::placeholder {
    color: var(--nd-fg);
    opacity: 0.4;
  }

  &:focus {
    outline: none;
    border-color: var(--nd-accent);
  }
}

.searchActions {
  display: flex;
  align-items: center;
  margin-left: 2px;
  gap: 1px;
}

.filterBtn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  border-radius: 3px;
  color: var(--nd-fg);
  opacity: 0.45;
  font-size: 13px;
  transition:
    opacity 0.1s,
    background 0.1s;

  &:hover {
    opacity: 0.85;
    background: var(--nd-buttonHoverBg);
  }
}

.filterBtnActive {
  opacity: 1;
  color: var(--nd-accent);
}

// --- Section header ---
.sectionHeader {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  border-bottom: 1px solid var(--nd-divider);
  flex-shrink: 0;
  user-select: none;
}

.sectionTitle {
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--nd-fg);
  opacity: 0.7;
}

.sectionCount {
  font-size: 11px;
  font-weight: 700;
  color: var(--nd-fg);
  opacity: 0.5;
}

.sectionSub {
  font-size: 11px;
  color: var(--nd-fg);
  opacity: 0.35;
}

// --- Wrapper ---
.wrapper {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
}

// --- Plugin list ---
.list {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  scrollbar-color: var(--nd-scrollbarHandle) transparent;
  scrollbar-width: thin;
}

// --- Card ---
.card {
  display: flex;
  gap: 10px;
  padding: 10px 12px;
  cursor: pointer;
  transition: background 0.1s;

  &:hover {
    background: var(--nd-buttonHoverBg);
  }

  & + & {
    border-top: 1px solid color-mix(in srgb, var(--nd-divider) 50%, transparent);
  }
}

.cardDisabled {
  opacity: 0.5;
}

.cardIcon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 42px;
  height: 42px;
  flex-shrink: 0;
  border-radius: 4px;
  background: color-mix(in srgb, var(--nd-accent) 12%, transparent);
  color: var(--nd-accent);
  font-size: 20px;
}

.cardBody {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 1px;
}

.cardRow1 {
  display: flex;
  align-items: baseline;
  gap: 6px;
  min-width: 0;
}

.cardName {
  font-size: 13px;
  font-weight: 600;
  color: var(--nd-fgHighlighted);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  min-width: 0;
}

.cardRow2 {
  font-size: 12px;
  color: var(--nd-fg);
  opacity: 0.65;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  line-height: 1.4;
}

.cardRow3 {
  display: flex;
  align-items: center;
  gap: 4px;
  margin-top: 2px;
  min-width: 0;
}

.cardAuthor {
  font-size: 11px;
  color: var(--nd-accent);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.cardVersion {
  font-size: 11px;
  color: var(--nd-fg);
  opacity: 0.4;
  flex-shrink: 0;
}

.cardSpacer {
  flex: 1;
}

.cardActionBtn {
  flex-shrink: 0;
  padding: 1px 8px;
  font-size: 11px;
  border-radius: 2px;
  opacity: 0;
  transition:
    opacity 0.15s,
    background 0.1s;

  .card:hover & {
    opacity: 1;
  }
}

.enableBtn {
  background: var(--nd-accent);
  color: var(--nd-fgOnAccent);

  &:hover {
    filter: brightness(1.1);
  }
}

.disableBtn {
  background: transparent;
  border: 1px solid var(--nd-divider);
  color: var(--nd-fg);

  &:hover {
    background: var(--nd-buttonHoverBg);
  }
}

.uninstallBtn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  flex-shrink: 0;
  border-radius: 3px;
  color: var(--nd-fg);
  font-size: 13px;
  opacity: 0;
  transition:
    opacity 0.15s,
    background 0.1s,
    color 0.1s;

  .card:hover & {
    opacity: 0.4;
  }

  &:hover {
    opacity: 1 !important;
    background: var(--nd-buttonHoverBg);
    color: var(--nd-love);
  }
}

.uninstallBtnConfirm {
  opacity: 1 !important;
  color: var(--nd-love);
  background: color-mix(in srgb, var(--nd-love) 12%, transparent);
}

.gearBtn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  flex-shrink: 0;
  border-radius: 3px;
  color: var(--nd-fg);
  font-size: 14px;
  opacity: 0;
  transition:
    opacity 0.15s,
    background 0.1s;

  .card:hover & {
    opacity: 0.6;
  }

  &:hover {
    opacity: 1 !important;
    background: var(--nd-buttonHoverBg);
  }
}

// --- Empty state ---
.empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 40px 20px;
  color: var(--nd-fg);
  opacity: 0.5;
  font-size: 13px;
  text-align: center;
}

.emptyIcon {
  font-size: 36px;
  opacity: 0.3;
}

.installLink {
  color: var(--nd-accent);
  font-size: 12px;
  margin-top: 4px;
  opacity: 0.8;
  transition: opacity 0.1s;

  &:hover {
    opacity: 1;
    text-decoration: underline;
  }
}
</style>
