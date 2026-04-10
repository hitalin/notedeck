<script setup lang="ts">
import { computed, reactive } from 'vue'
import { useColumnTheme } from '@/composables/useColumnTheme'
import { getAccountLabel, useAccountsStore } from '@/stores/accounts'
import type { DeckColumn as DeckColumnType } from '@/stores/deck'
import { useDeckProfileStore } from '@/stores/deckProfile'
import { usePluginsStore } from '@/stores/plugins'
import { useThemeStore } from '@/stores/theme'
import { useWindowsStore } from '@/stores/windows'
import DeckColumn from './DeckColumn.vue'

const props = defineProps<{
  column: DeckColumnType
}>()

const { columnThemeVars } = useColumnTheme(() => props.column)

const themeStore = useThemeStore()
const pluginsStore = usePluginsStore()
const deckProfileStore = useDeckProfileStore()
const accountsStore = useAccountsStore()
const windowsStore = useWindowsStore()

// プラグインは lazy load なので明示的にロードトリガー (idempotent)
pluginsStore.ensureLoaded()

// Reactive accessors
const themes = computed(() => themeStore.installedThemes)
const plugins = computed(() => pluginsStore.plugins)
const profiles = computed(() => deckProfileStore.getProfiles())
const accounts = computed(() => accountsStore.accounts)

const expanded = reactive<Record<string, boolean>>({
  themes: true,
  plugins: true,
  profiles: true,
  accounts: true,
})

function toggle(key: string) {
  expanded[key] = !expanded[key]
}

function collapseAll() {
  for (const key of Object.keys(expanded)) {
    expanded[key] = false
  }
}

// themes/
function openThemeFile(id: string) {
  const theme = themes.value.find((t) => t.id === id)
  if (!theme) return
  const mode: 'dark' | 'light' = theme.base ?? 'dark'
  themeStore.selectTheme(id, mode)
  windowsStore.open('themeEditor')
}

function addTheme() {
  windowsStore.open('themeEditor')
}

// plugins/
function openPluginFile() {
  windowsStore.open('plugins')
}

function addPlugin() {
  windowsStore.open('plugins')
}

// profiles/
async function openProfileFile(id: string) {
  const { switchProfileWithWindows } = await import(
    '@/composables/useDeckWindow'
  )
  await switchProfileWithWindows(id)
}

function addProfile() {
  deckProfileStore.createEmptyProfile()
}

// accounts/
function openAccountFile() {
  windowsStore.open('account-manager')
}

function addAccount() {
  windowsStore.open('login')
}

// Singleton files
function openUserCss() {
  windowsStore.open('cssEditor')
}

function openKeybinds() {
  windowsStore.open('keybinds')
}

function openNavJson() {
  windowsStore.open('navEditor')
}

interface TreeFile {
  id: string
  name: string
  icon: string
  onClick: () => void
}

interface TreeFolder {
  key: string
  label: string
  addTitle: string
  onAdd: () => void
  items: TreeFile[]
}

const folders = computed<TreeFolder[]>(() => [
  {
    key: 'themes',
    label: 'themes',
    addTitle: '新しいテーマを作成',
    onAdd: addTheme,
    items: themes.value.map((t) => ({
      id: t.id,
      name: `${t.name || t.id}.json5`,
      icon: 'ti-palette',
      onClick: () => openThemeFile(t.id),
    })),
  },
  {
    key: 'plugins',
    label: 'plugins',
    addTitle: 'プラグインを追加',
    onAdd: addPlugin,
    items: plugins.value.map((p) => ({
      id: p.installId,
      name: `${p.name || p.installId}.is`,
      icon: 'ti-puzzle',
      onClick: () => openPluginFile(),
    })),
  },
  {
    key: 'profiles',
    label: 'profiles',
    addTitle: '新しいプロファイルを作成',
    onAdd: addProfile,
    items: profiles.value.map((p) => ({
      id: p.id,
      name: `${p.name}.json`,
      icon: 'ti-layout-2',
      onClick: () => openProfileFile(p.id),
    })),
  },
  {
    key: 'accounts',
    label: 'accounts',
    addTitle: 'アカウントを追加',
    onAdd: addAccount,
    items: accounts.value.map((a) => ({
      id: a.id,
      name: getAccountLabel(a),
      icon: 'ti-user',
      onClick: () => openAccountFile(),
    })),
  },
])

const singletonFiles: TreeFile[] = [
  {
    id: 'keybinds',
    name: 'keybinds.json',
    icon: 'ti-keyboard',
    onClick: openKeybinds,
  },
  {
    id: 'user.css',
    name: 'user.css',
    icon: 'ti-brush',
    onClick: openUserCss,
  },
  {
    id: 'nav',
    name: 'nav.json',
    icon: 'ti-menu-2',
    onClick: openNavJson,
  },
]
</script>

<template>
  <DeckColumn
    :column-id="column.id"
    :title="column.name ?? 'エクスプローラー'"
    :theme-vars="columnThemeVars"
  >
    <template #header-icon>
      <i class="ti ti-files tl-header-icon" />
    </template>

    <div :class="$style.explorer">
      <div :class="$style.toolbar">
        <button
          type="button"
          :class="$style.toolbarBtn"
          title="すべて折りたたむ"
          @click="collapseAll"
        >
          <i class="ti ti-layout-navbar-collapse" />
        </button>
      </div>

      <div :class="$style.tree">
        <template
          v-for="folder in folders"
          :key="folder.key"
        >
          <!-- folder row -->
          <div
            :class="[$style.row, $style.folderRow]"
            @click="toggle(folder.key)"
          >
            <i
              class="ti ti-chevron-right"
              :class="[$style.chevron, { [$style.chevronExpanded]: expanded[folder.key] }]"
            />
            <i
              class="ti"
              :class="[expanded[folder.key] ? 'ti-folder-open' : 'ti-folder', $style.folderIcon]"
            />
            <span :class="$style.name">{{ folder.label }}</span>
            <button
              type="button"
              :class="$style.inlineAction"
              :title="folder.addTitle"
              @click.stop="folder.onAdd()"
            >
              <i class="ti ti-plus" />
            </button>
          </div>

          <!-- folder contents -->
          <div v-if="expanded[folder.key]" :class="$style.folderBody">
            <div
              v-for="item in folder.items"
              :key="item.id"
              :class="[$style.row, $style.fileRow]"
              @click="item.onClick()"
            >
              <i class="ti" :class="[item.icon, $style.fileIcon]" />
              <span :class="$style.name">{{ item.name }}</span>
            </div>
            <div
              v-if="folder.items.length === 0"
              :class="[$style.row, $style.fileRow, $style.emptyRow]"
            >
              (空)
            </div>
          </div>
        </template>

        <!-- singleton files at root -->
        <div
          v-for="file in singletonFiles"
          :key="file.id"
          :class="[$style.row, $style.rootFileRow]"
          @click="file.onClick()"
        >
          <i class="ti" :class="[file.icon, $style.fileIcon]" />
          <span :class="$style.name">{{ file.name }}</span>
        </div>
      </div>
    </div>
  </DeckColumn>
</template>

<style module lang="scss">
.explorer {
  display: flex;
  flex-direction: column;
  height: 100%;
  font-size: 13px;
  color: var(--nd-fg);
}

.toolbar {
  display: flex;
  justify-content: flex-end;
  align-items: center;
  padding: 2px 8px;
  min-height: 24px;
  gap: 2px;
  opacity: 0;
  transition: opacity 0.15s;

  .explorer:hover & {
    opacity: 1;
  }
}

.toolbarBtn {
  all: unset;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  border-radius: 3px;
  color: var(--nd-fgMuted);
  cursor: pointer;

  &:hover {
    background: var(--nd-panelHighlight);
    color: var(--nd-fg);
  }

  i {
    font-size: 14px;
  }
}

.tree {
  flex: 1;
  overflow-y: auto;
  padding-bottom: 8px;
}

.row {
  display: flex;
  align-items: center;
  height: 22px;
  padding: 0 10px 0 8px;
  cursor: pointer;
  user-select: none;

  &:hover {
    background: var(--nd-panelHighlight);
  }
}

.folderRow {
  gap: 2px;
}

.fileRow {
  gap: 4px;
  padding-left: 28px;
}

.rootFileRow {
  gap: 4px;
  padding-left: 26px;
}

.chevron {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 14px;
  height: 14px;
  font-size: 10px;
  color: var(--nd-fgMuted);
  transition: transform 0.12s ease;
  flex-shrink: 0;
}

.chevronExpanded {
  transform: rotate(90deg);
}

.folderIcon {
  font-size: 14px;
  color: var(--nd-fgMuted);
  flex-shrink: 0;
  margin-right: 2px;
}

.fileIcon {
  font-size: 14px;
  color: var(--nd-fgMuted);
  flex-shrink: 0;
}

.name {
  flex: 1;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  font-size: 13px;
  line-height: 22px;
}

.inlineAction {
  all: unset;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  border-radius: 3px;
  color: var(--nd-fgMuted);
  cursor: pointer;
  opacity: 0;
  transition: opacity 0.1s, background 0.1s;

  .folderRow:hover & {
    opacity: 0.7;
  }

  &:hover {
    background: var(--nd-panelHighlight2);
    opacity: 1 !important;
    color: var(--nd-fg);
  }

  i {
    font-size: 12px;
  }
}

.emptyRow {
  color: var(--nd-fgMuted);
  font-style: italic;
  font-size: 12px;
  cursor: default;

  &:hover {
    background: transparent;
  }
}

.folderBody {
  position: relative;

  // VSCode 風のインデントガイド (薄い縦線)
  &::before {
    content: '';
    position: absolute;
    left: 15px;
    top: 0;
    bottom: 0;
    width: 1px;
    background: var(--nd-divider);
    opacity: 0.6;
    pointer-events: none;
  }
}
</style>
