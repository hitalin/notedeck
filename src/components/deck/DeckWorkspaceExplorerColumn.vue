<script setup lang="ts">
import { computed, nextTick, reactive, ref, useTemplateRef, watch } from 'vue'
import PopupMenu from '@/components/common/PopupMenu.vue'
import { useColumnTheme } from '@/composables/useColumnTheme'
import { useConfirm } from '@/stores/confirm'
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
const windowsStore = useWindowsStore()

// プラグインは lazy load なので明示的にロードトリガー (idempotent)
pluginsStore.ensureLoaded()

// Reactive accessors
const themes = computed(() => themeStore.installedThemes)
const plugins = computed(() => pluginsStore.plugins)
const profiles = computed(() => deckProfileStore.getProfiles())

const expanded = reactive<Record<string, boolean>>({
  themes: true,
  plugins: true,
  profiles: true,
  accounts: true,
})

// 選択中の行のキー (null = 未選択)。visibleRows 計算と template の
// selected クラス適用の両方で参照される。
const selectedKey = ref<string | null>(null)

function toggle(key: string) {
  const willCollapse = expanded[key]
  expanded[key] = !expanded[key]
  // フォルダを畳む時、その中のファイルが選択されていたら
  // 選択をフォルダ自体に移す (VSCode 同等の挙動)
  if (willCollapse && selectedKey.value?.startsWith(`file:${key}:`)) {
    selectedKey.value = `folder:${key}`
  }
}

function collapseAll() {
  for (const key of Object.keys(expanded)) {
    expanded[key] = false
  }
  // 畳まれて見えなくなった選択は一旦クリア
  if (selectedKey.value?.startsWith('file:')) {
    selectedKey.value = null
  }
}

// themes/
function openThemeFile(id: string) {
  const theme = themes.value.find((t) => t.id === id)
  if (!theme) return
  const mode: 'dark' | 'light' = theme.base ?? 'dark'
  themeStore.selectTheme(id, mode)
  windowsStore.open('themeEditor', { initialThemeId: id, initialTab: 'code' })
}

function addTheme() {
  windowsStore.open('themeEditor')
}

// plugins/
function openPluginFile(installId: string) {
  windowsStore.open('plugins', {
    initialPluginId: installId,
    initialTab: 'code',
  })
}

function addPlugin() {
  windowsStore.open('plugins')
}

// profiles/
function openProfileFile(id: string) {
  windowsStore.open('profileEditor', { profileId: id, initialTab: 'code' })
}

function addProfile() {
  deckProfileStore.createEmptyProfile()
}

// accounts/
function openAccountFile() {
  windowsStore.open('account-manager', { initialTab: 'code' })
}

function addAccount() {
  windowsStore.open('login')
}

// Singleton files
function openSettings() {
  windowsStore.open('settingsEditor')
}

function openUserCss() {
  windowsStore.open('cssEditor', { initialTab: 'code' })
}

function openKeybinds() {
  windowsStore.open('keybinds', { initialTab: 'code' })
}

function openNavJson() {
  windowsStore.open('navEditor', { initialTab: 'code' })
}

function openPerformance() {
  windowsStore.open('performanceEditor')
}

interface FileTypeInfo {
  icon: string
  colorClass: string
}

/**
 * ファイル名の拡張子から VSCode Material Icon Theme 風のアイコン + 色を返す。
 * 拡張子ベースで一貫性を保つ (`.json` は常に同じ見た目)。
 */
function fileTypeFor(filename: string): FileTypeInfo {
  if (filename.endsWith('.json5')) {
    return { icon: 'ti-braces', colorClass: 'iconJson5' }
  }
  if (filename.endsWith('.json')) {
    return { icon: 'ti-braces', colorClass: 'iconJson' }
  }
  if (filename.endsWith('.is')) {
    return { icon: 'ti-file-code', colorClass: 'iconIs' }
  }
  if (filename.endsWith('.css')) {
    return { icon: 'ti-brush', colorClass: 'iconCss' }
  }
  return { icon: 'ti-file', colorClass: '' }
}

interface TreeFile {
  id: string
  name: string
  icon: string
  colorClass: string
  onClick: () => void
}

interface TreeFolder {
  key: string
  label: string
  icon: string
  colorClass: string
  addTitle: string
  onAdd: () => void
  items: TreeFile[]
}

const folders = computed<TreeFolder[]>(() => [
  {
    key: 'themes',
    label: 'themes',
    icon: 'ti-palette',
    colorClass: 'folderThemes',
    addTitle: '新しいテーマを作成',
    onAdd: addTheme,
    items: themes.value.map((t) => {
      const name = `${t.name || t.id}.json5`
      return {
        id: t.id,
        name,
        ...fileTypeFor(name),
        onClick: () => openThemeFile(t.id),
      }
    }),
  },
  {
    key: 'plugins',
    label: 'plugins',
    icon: 'ti-plug',
    colorClass: 'folderPlugins',
    addTitle: 'プラグインを追加',
    onAdd: addPlugin,
    items: plugins.value.map((p) => {
      const name = `${p.name || p.installId}.is`
      return {
        id: p.installId,
        name,
        ...fileTypeFor(name),
        onClick: () => openPluginFile(p.installId),
      }
    }),
  },
  {
    key: 'profiles',
    label: 'profiles',
    icon: 'ti-layout-2',
    colorClass: 'folderProfiles',
    addTitle: '新しいプロファイルを作成',
    onAdd: addProfile,
    items: profiles.value.map((p) => {
      const name = `${p.name}.json`
      return {
        id: p.id,
        name,
        ...fileTypeFor(name),
        onClick: () => openProfileFile(p.id),
      }
    }),
  },
  {
    key: 'accounts',
    label: 'accounts',
    icon: 'ti-users',
    colorClass: 'folderAccounts',
    addTitle: 'アカウントを追加',
    onAdd: addAccount,
    items: [
      {
        id: 'accounts',
        name: 'accounts.json5',
        ...fileTypeFor('accounts.json5'),
        onClick: () => openAccountFile(),
      },
    ],
  },
])

const singletonFiles: TreeFile[] = [
  {
    id: 'notedeck',
    name: 'settings.json5',
    ...fileTypeFor('settings.json5'),
    onClick: openSettings,
  },
  {
    id: 'keybinds',
    name: 'keybinds.json5',
    ...fileTypeFor('keybinds.json5'),
    onClick: openKeybinds,
  },
  {
    id: 'navbar',
    name: 'navbar.json5',
    ...fileTypeFor('navbar.json5'),
    onClick: openNavJson,
  },
  {
    id: 'performance',
    name: 'performance.json5',
    ...fileTypeFor('performance.json5'),
    onClick: openPerformance,
  },
  {
    id: 'custom.css',
    name: 'custom.css',
    ...fileTypeFor('custom.css'),
    onClick: openUserCss,
  },
]

// --- Row key helpers (selection + visibleRows の統一 ID) ---
const rowKeyFolder = (folderKey: string) => `folder:${folderKey}`
const rowKeyFile = (folderKey: string, fileId: string) =>
  `file:${folderKey}:${fileId}`
const rowKeyRootFile = (fileId: string) => `root:${fileId}`
const rowKeyEmpty = (folderKey: string) => `empty:${folderKey}`

// --- Visible rows (flat list for keyboard navigation) ---
interface VisibleRow {
  key: string
  kind: 'folder' | 'file' | 'rootFile' | 'empty'
  folderKey?: string
  folder?: TreeFolder
  file?: TreeFile
}

const visibleRows = computed<VisibleRow[]>(() => {
  const rows: VisibleRow[] = []
  for (const folder of folders.value) {
    rows.push({
      key: rowKeyFolder(folder.key),
      kind: 'folder',
      folderKey: folder.key,
      folder,
    })
    if (!expanded[folder.key]) continue
    if (folder.items.length === 0) {
      rows.push({
        key: rowKeyEmpty(folder.key),
        kind: 'empty',
        folderKey: folder.key,
      })
      continue
    }
    for (const item of folder.items) {
      rows.push({
        key: rowKeyFile(folder.key, item.id),
        kind: 'file',
        folderKey: folder.key,
        file: item,
      })
    }
  }
  for (const file of singletonFiles) {
    rows.push({
      key: rowKeyRootFile(file.id),
      kind: 'rootFile',
      file,
    })
  }
  return rows
})

// --- Selection + row click helpers ---
function onFolderRowClick(folder: TreeFolder) {
  selectedKey.value = rowKeyFolder(folder.key)
  toggle(folder.key)
}

function onFileRowClick(folderKey: string, file: TreeFile) {
  selectedKey.value = rowKeyFile(folderKey, file.id)
  file.onClick()
}

function onRootFileRowClick(file: TreeFile) {
  selectedKey.value = rowKeyRootFile(file.id)
  file.onClick()
}

// --- Keyboard navigation ---
const treeEl = useTemplateRef<HTMLElement>('treeEl')

function currentRowIndex(): number {
  if (!selectedKey.value) return -1
  return visibleRows.value.findIndex((r) => r.key === selectedKey.value)
}

function moveSelection(delta: number) {
  const rows = visibleRows.value
  if (rows.length === 0) return
  let idx = currentRowIndex()
  if (idx < 0) {
    idx = delta > 0 ? 0 : rows.length - 1
  } else {
    idx = Math.max(0, Math.min(rows.length - 1, idx + delta))
  }
  // 空行 (empty folder placeholder) はスキップ
  while (rows[idx]?.kind === 'empty' && idx > 0 && idx < rows.length - 1) {
    idx += delta > 0 ? 1 : -1
  }
  const target = rows[idx]
  if (!target || target.kind === 'empty') return
  selectedKey.value = target.key
}

function selectFirst() {
  const rows = visibleRows.value
  if (rows.length === 0) return
  selectedKey.value = rows.find((r) => r.kind !== 'empty')?.key ?? null
}

function selectLast() {
  const rows = visibleRows.value
  if (rows.length === 0) return
  for (let i = rows.length - 1; i >= 0; i--) {
    const row = rows[i]
    if (row && row.kind !== 'empty') {
      selectedKey.value = row.key
      return
    }
  }
}

function activateSelected() {
  const row = visibleRows.value.find((r) => r.key === selectedKey.value)
  if (!row) return
  if (row.kind === 'folder' && row.folderKey) {
    toggle(row.folderKey)
    return
  }
  if ((row.kind === 'file' || row.kind === 'rootFile') && row.file) {
    row.file.onClick()
  }
}

function expandOrMoveToFirstChild() {
  const row = visibleRows.value.find((r) => r.key === selectedKey.value)
  if (!row || row.kind !== 'folder' || !row.folder || !row.folderKey) return
  if (!expanded[row.folderKey]) {
    expanded[row.folderKey] = true
    return
  }
  const firstItem = row.folder.items[0]
  if (firstItem) {
    selectedKey.value = rowKeyFile(row.folderKey, firstItem.id)
  }
}

function collapseOrMoveToParent() {
  const row = visibleRows.value.find((r) => r.key === selectedKey.value)
  if (!row) return
  if (row.kind === 'folder' && row.folderKey && expanded[row.folderKey]) {
    expanded[row.folderKey] = false
    return
  }
  if (row.kind === 'file' && row.folderKey) {
    selectedKey.value = rowKeyFolder(row.folderKey)
  }
}

function onKeydown(e: KeyboardEvent) {
  // Rename 入力中はツリーキーボード操作を無視
  if (renamingKey.value) return
  // 修飾キー付きはスキップ (コマンドパレット等と競合しないため)
  if (e.ctrlKey || e.metaKey || e.altKey) return
  switch (e.key) {
    case 'ArrowDown':
      e.preventDefault()
      moveSelection(1)
      break
    case 'ArrowUp':
      e.preventDefault()
      moveSelection(-1)
      break
    case 'ArrowRight':
      e.preventDefault()
      expandOrMoveToFirstChild()
      break
    case 'ArrowLeft':
      e.preventDefault()
      collapseOrMoveToParent()
      break
    case 'Enter':
    case ' ':
      e.preventDefault()
      activateSelected()
      break
    case 'Home':
      e.preventDefault()
      selectFirst()
      break
    case 'End':
      e.preventDefault()
      selectLast()
      break
    case 'F2':
      e.preventDefault()
      startRenameForSelected()
      break
    case 'Delete':
      e.preventDefault()
      deleteSelected()
      break
    case 'Escape':
      e.preventDefault()
      closeContextMenu()
      break
  }
}

// 選択変更時に該当行を可視範囲にスクロール
watch(selectedKey, (key) => {
  if (!key || !treeEl.value) return
  nextTick(() => {
    const row = treeEl.value?.querySelector<HTMLElement>(
      `[data-row-key="${CSS.escape(key)}"]`,
    )
    row?.scrollIntoView({ block: 'nearest' })
  })
})

// --- Context menu ---
const { confirm } = useConfirm()

interface ContextAction {
  label: string
  icon: string
  danger?: boolean
  handler: () => void | Promise<void>
}

const contextMenuRef = ref<InstanceType<typeof PopupMenu>>()
const contextActions = ref<ContextAction[]>([])

function closeContextMenu(): void {
  contextMenuRef.value?.close()
}

function showContextMenu(e: MouseEvent, actions: ContextAction[]): void {
  if (actions.length === 0) return
  contextActions.value = actions
  contextMenuRef.value?.open(e)
}

function onContextAction(action: ContextAction): void {
  closeContextMenu()
  action.handler()
}

function onFolderContextMenu(e: MouseEvent, folder: TreeFolder): void {
  showContextMenu(e, [
    {
      label: folder.addTitle,
      icon: 'ti-plus',
      handler: folder.onAdd,
    },
  ])
}

function onRootFileContextMenu(e: MouseEvent, file: TreeFile): void {
  showContextMenu(e, [
    { label: '開く', icon: 'ti-external-link', handler: file.onClick },
  ])
}

function onFileContextMenu(
  e: MouseEvent,
  folderKey: string,
  file: TreeFile,
): void {
  const actions: ContextAction[] = [
    { label: '開く', icon: 'ti-external-link', handler: file.onClick },
  ]

  // Rename (accounts are identity-bound, so excluded)
  if (
    folderKey === 'themes' ||
    folderKey === 'plugins' ||
    folderKey === 'profiles'
  ) {
    actions.push({
      label: '名前を変更',
      icon: 'ti-pencil',
      handler: () => startRename(rowKeyFile(folderKey, file.id), file.name),
    })
  }

  // Delete
  if (folderKey === 'themes') {
    actions.push({
      label: '削除',
      icon: 'ti-trash',
      danger: true,
      handler: () => deleteTheme(file.id),
    })
  } else if (folderKey === 'plugins') {
    actions.push({
      label: '削除',
      icon: 'ti-trash',
      danger: true,
      handler: () => deletePlugin(file.id),
    })
  } else if (folderKey === 'profiles') {
    actions.push({
      label: '削除',
      icon: 'ti-trash',
      danger: true,
      handler: () => deleteProfile(file.id),
    })
  }

  showContextMenu(e, actions)
}

// --- Delete actions (with confirmation) ---
async function deleteTheme(id: string): Promise<void> {
  const ok = await confirm({
    title: 'テーマを削除',
    message: 'このテーマを削除しますか？',
    okLabel: '削除',
    type: 'danger',
  })
  if (ok) themeStore.removeTheme(id)
}

async function deletePlugin(installId: string): Promise<void> {
  const ok = await confirm({
    title: 'プラグインを削除',
    message: 'このプラグインを削除しますか？',
    okLabel: '削除',
    type: 'danger',
  })
  if (ok) pluginsStore.removePlugin(installId)
}

async function deleteProfile(id: string): Promise<void> {
  const ok = await confirm({
    title: 'プロファイルを削除',
    message: 'このプロファイルを削除しますか？',
    okLabel: '削除',
    type: 'danger',
  })
  if (ok) deckProfileStore.deleteProfile(id)
}

function deleteSelected(): void {
  const row = visibleRows.value.find((r) => r.key === selectedKey.value)
  if (!row || !row.file || !row.folderKey) return
  if (row.folderKey === 'themes') deleteTheme(row.file.id)
  else if (row.folderKey === 'plugins') deletePlugin(row.file.id)
  else if (row.folderKey === 'profiles') deleteProfile(row.file.id)
}

// --- Inline rename (Phase E) ---
const renamingKey = ref<string | null>(null)
const renameInput = ref('')

function startRename(rowKey: string, currentName: string): void {
  // Strip extension for editing (e.g. "default.json" → "default")
  const dotIdx = currentName.lastIndexOf('.')
  renameInput.value = dotIdx > 0 ? currentName.slice(0, dotIdx) : currentName
  renamingKey.value = rowKey
  nextTick(() => {
    const input = treeEl.value?.querySelector<HTMLInputElement>(
      '[data-rename-input]',
    )
    input?.focus()
    input?.select()
  })
}

function startRenameForSelected(): void {
  const row = visibleRows.value.find((r) => r.key === selectedKey.value)
  if (!row || !row.file) return
  if (
    row.folderKey !== 'themes' &&
    row.folderKey !== 'plugins' &&
    row.folderKey !== 'profiles'
  )
    return
  startRename(row.key, row.file.name)
}

async function confirmRename(): Promise<void> {
  if (!renamingKey.value) return
  const newName = renameInput.value.trim()
  if (!newName) {
    cancelRename()
    return
  }

  // Parse the row key to determine what to rename
  const match = renamingKey.value.match(/^file:(\w+):(.+)$/)
  if (!match?.[1] || !match[2]) {
    cancelRename()
    return
  }
  const folderKey = match[1]
  const fileId = match[2]

  if (folderKey === 'themes') {
    themeStore.renameTheme(fileId, newName)
  } else if (folderKey === 'plugins') {
    pluginsStore.renamePlugin(fileId, newName)
  } else if (folderKey === 'profiles') {
    deckProfileStore.renameProfile(fileId, newName)
  }

  renamingKey.value = null
  renameInput.value = ''
}

function cancelRename(): void {
  renamingKey.value = null
  renameInput.value = ''
}

function onRenameKeydown(e: KeyboardEvent): void {
  if (e.key === 'Enter') {
    e.preventDefault()
    confirmRename()
  } else if (e.key === 'Escape') {
    e.preventDefault()
    cancelRename()
  }
}
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

      <div
        ref="treeEl"
        :class="$style.tree"
        tabindex="0"
        @keydown="onKeydown"
      >
        <template
          v-for="folder in folders"
          :key="folder.key"
        >
          <!-- folder row -->
          <div
            :data-row-key="`folder:${folder.key}`"
            :title="`${folder.label}/`"
            :class="[
              $style.row,
              $style.folderRow,
              { [$style.selected]: selectedKey === `folder:${folder.key}` },
            ]"
            @click="onFolderRowClick(folder)"
            @contextmenu.prevent="onFolderContextMenu($event, folder)"
          >
            <i
              class="ti ti-chevron-right"
              :class="[$style.chevron, { [$style.chevronExpanded]: expanded[folder.key] }]"
            />
            <i
              class="ti"
              :class="[folder.icon, $style.folderIcon, $style[folder.colorClass]]"
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
              :data-row-key="`file:${folder.key}:${item.id}`"
              :title="`${folder.label}/${item.name}`"
              :class="[
                $style.row,
                $style.fileRow,
                { [$style.selected]: selectedKey === `file:${folder.key}:${item.id}` },
              ]"
              @click="onFileRowClick(folder.key, item)"
              @contextmenu.prevent="onFileContextMenu($event, folder.key, item)"
              @dblclick.prevent="(folder.key === 'themes' || folder.key === 'plugins' || folder.key === 'profiles') && startRename(`file:${folder.key}:${item.id}`, item.name)"
            >
              <i
                class="ti"
                :class="[item.icon, $style.fileIcon, $style[item.colorClass]]"
              />
              <!-- Inline rename input -->
              <input
                v-if="renamingKey === `file:${folder.key}:${item.id}`"
                v-model="renameInput"
                data-rename-input
                :class="$style.renameInput"
                @keydown="onRenameKeydown"
                @blur="confirmRename"
                @click.stop
              />
              <span v-else :class="$style.name">{{ item.name }}</span>
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
          :data-row-key="`root:${file.id}`"
          :title="file.name"
          :class="[
            $style.row,
            $style.rootFileRow,
            { [$style.selected]: selectedKey === `root:${file.id}` },
          ]"
          @click="onRootFileRowClick(file)"
          @contextmenu.prevent="onRootFileContextMenu($event, file)"
        >
          <i
            class="ti"
            :class="[file.icon, $style.fileIcon, $style[file.colorClass]]"
          />
          <span :class="$style.name">{{ file.name }}</span>
        </div>
      </div>

      <!-- Context menu (reuses shared PopupMenu component) -->
      <PopupMenu ref="contextMenuRef">
        <button
          v-for="action in contextActions"
          :key="action.label"
          :class="['_popupItem', { _popupItemDanger: action.danger }]"
          @click="onContextAction(action)"
        >
          <i class="ti" :class="action.icon" />
          {{ action.label }}
        </button>
      </PopupMenu>
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
  outline: none; // tabindex focus 時のデフォルト枠線を消す
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

// 選択中の行 (ホバーより強い背景)
.selected,
.selected:hover {
  background: var(--nd-panelHighlight2);
}

// ツリーがキーボードフォーカスを持つ時、選択行をさらに強調
.tree:focus-visible .selected,
.tree:focus .selected {
  background: color-mix(in srgb, var(--nd-accent) 22%, transparent);
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

// --- Material Icon Theme 風の拡張子別カラー ---
// 順序重要: .fileIcon / .folderIcon の後に置くことで color を上書き

// ファイル: 拡張子ベース
.iconJson {
  color: #d7ac4a; // yellow-gold (VSCode JSON braces 相当)
}

.iconJson5 {
  color: #e09434; // orange-gold (.json と区別)
}

.iconIs {
  color: #b97bd5; // purple (AiScript の主観色)
}

.iconCss {
  color: #5294e2; // sky blue
}

// フォルダ: 意味ベース (Material Icon Theme 流)
.folderThemes {
  color: #e0538b; // pink (テーマ = 外観)
}

.folderPlugins {
  color: #b97bd5; // purple (.is と統一)
}

.folderProfiles {
  color: #5294e2; // blue (.css と統一しつつレイアウト感)
}

.folderAccounts {
  color: #66bb6a; // green (identity)
}

// --- Inline rename ---
.renameInput {
  all: unset;
  flex: 1;
  font-size: 13px;
  line-height: 18px;
  padding: 0 4px;
  border: 1px solid var(--nd-accent);
  border-radius: 2px;
  background: var(--nd-bg);
  color: var(--nd-fg);
  outline: none;
}
</style>
