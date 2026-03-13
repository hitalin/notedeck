<script setup lang="ts">
import { computed, ref } from 'vue'
import type { Shortcut } from '@/commands/registry'
import { useKeybindsStore } from '@/stores/keybinds'

const keybindsStore = useKeybindsStore()
const commandIds = keybindsStore.getAllCommandIds()

const COMMAND_LABELS: Record<string, string> = {
  'command-palette': 'コマンドパレット',
  search: '検索',
  notifications: '通知',
  compose: 'ノート作成',
  'add-column': 'カラム追加',
  'toggle-sidebar': 'サイドバー切替',
  'boss-key': 'ウィンドウを隠す',
  'account-menu': 'アカウントメニュー',
  'note-next': '次のノート',
  'note-prev': '前のノート',
  'note-reply': '返信',
  'note-react': 'リアクション',
  'note-renote': 'リノート / 引用',
  'note-bookmark': 'ブックマーク',
  'note-open': 'ノートを開く',
  'note-cw': 'CW切替',
  'column-next': '次のカラム',
  'column-prev': '前のカラム',
  ...Object.fromEntries(
    Array.from({ length: 9 }, (_, i) => [
      `column-${i + 1}`,
      `カラム ${i + 1} に移動`,
    ]),
  ),
  ...Object.fromEntries(
    Array.from({ length: 9 }, (_, i) => [
      `quick-react-${i + 1}`,
      `クイックリアクション ${i + 1}`,
    ]),
  ),
}

const CATEGORY_ORDER = [
  'general',
  'navigation',
  'account',
  'column',
  'note',
] as const

const COMMAND_CATEGORIES: Record<string, string> = {
  'command-palette': 'general',
  search: 'navigation',
  notifications: 'navigation',
  compose: 'general',
  'add-column': 'column',
  'toggle-sidebar': 'navigation',
  'boss-key': 'general',
  'account-menu': 'account',
  'note-next': 'note',
  'note-prev': 'note',
  'note-reply': 'note',
  'note-react': 'note',
  'note-renote': 'note',
  'note-bookmark': 'note',
  'note-open': 'note',
  'note-cw': 'note',
  'column-next': 'column',
  'column-prev': 'column',
  ...Object.fromEntries(
    Array.from({ length: 9 }, (_, i) => [`column-${i + 1}`, 'column']),
  ),
  ...Object.fromEntries(
    Array.from({ length: 9 }, (_, i) => [`quick-react-${i + 1}`, 'note']),
  ),
}

const CATEGORY_LABELS: Record<string, string> = {
  general: '全般',
  navigation: 'ナビゲーション',
  account: 'アカウント',
  column: 'カラム',
  note: 'ノート',
}

const groupedCommands = computed(() => {
  const groups: { category: string; label: string; commands: string[] }[] = []
  for (const cat of CATEGORY_ORDER) {
    const cmds = commandIds.filter((id) => COMMAND_CATEGORIES[id] === cat)
    if (cmds.length > 0) {
      groups.push({
        category: cat,
        label: CATEGORY_LABELS[cat] ?? cat,
        commands: cmds,
      })
    }
  }
  return groups
})

// Recording state
const recordingCommandId = ref<string | null>(null)
const recordingIndex = ref(-1)

function formatShortcut(s: Shortcut): string {
  const parts: string[] = []
  if (s.ctrl) parts.push('Ctrl')
  if (s.shift) parts.push('Shift')
  if (s.alt) parts.push('Alt')
  parts.push(s.key.length === 1 ? s.key.toUpperCase() : s.key)
  return parts.join(' + ')
}

function startRecording(commandId: string, index: number) {
  recordingCommandId.value = commandId
  recordingIndex.value = index
}

function onKeyDown(e: KeyboardEvent, commandId: string, index: number) {
  if (recordingCommandId.value !== commandId || recordingIndex.value !== index)
    return
  e.preventDefault()
  e.stopPropagation()

  if (e.key === 'Escape') {
    recordingCommandId.value = null
    return
  }

  // Ignore lone modifier keys
  if (['Control', 'Shift', 'Alt', 'Meta'].includes(e.key)) return

  const hasModifier = e.ctrlKey || e.metaKey || e.shiftKey || e.altKey
  const scope: Shortcut['scope'] = hasModifier ? 'global' : 'body'

  const newShortcut: Shortcut = {
    key: e.key,
    ...(e.ctrlKey || e.metaKey ? { ctrl: true } : {}),
    ...(e.shiftKey ? { shift: true } : {}),
    ...(e.altKey ? { alt: true } : {}),
    scope,
  }

  const shortcuts = [...keybindsStore.getShortcuts(commandId)]
  if (index < shortcuts.length) {
    shortcuts[index] = newShortcut
  } else {
    shortcuts.push(newShortcut)
  }
  keybindsStore.setShortcuts(commandId, shortcuts)
  recordingCommandId.value = null
}

function removeShortcut(commandId: string, index: number) {
  const shortcuts = [...keybindsStore.getShortcuts(commandId)]
  shortcuts.splice(index, 1)
  keybindsStore.setShortcuts(commandId, shortcuts)
}

function addShortcut(commandId: string) {
  const shortcuts = keybindsStore.getShortcuts(commandId)
  startRecording(commandId, shortcuts.length)
}

function resetCommand(commandId: string) {
  keybindsStore.resetToDefault(commandId)
}

function resetAll() {
  keybindsStore.resetAll()
}
</script>

<template>
  <div :class="$style.keybindsContent">
    <div :class="$style.keybindsHeader">
      <span :class="$style.keybindsTitle">キーバインド設定</span>
      <button class="_button" :class="$style.resetAllBtn" @click="resetAll">
        <i class="ti ti-restore" />
        すべてリセット
      </button>
    </div>

    <div :class="$style.keybindsList">
      <template v-for="group in groupedCommands" :key="group.category">
        <div :class="$style.categoryHeader">{{ group.label }}</div>
        <div
          v-for="cmdId in group.commands"
          :key="cmdId"
          :class="[$style.keybindRow, { [$style.customized]: keybindsStore.isCustomized(cmdId) }]"
        >
          <div :class="$style.keybindLabel">
            {{ COMMAND_LABELS[cmdId] ?? cmdId }}
          </div>
          <div :class="$style.keybindShortcuts">
            <template v-for="(shortcut, idx) in keybindsStore.getShortcuts(cmdId)" :key="idx">
              <div
                :class="[$style.shortcutBadge, { [$style.recording]: recordingCommandId === cmdId && recordingIndex === idx }]"
                tabindex="0"
                @click="startRecording(cmdId, idx)"
                @keydown="onKeyDown($event, cmdId, idx)"
              >
                <template v-if="recordingCommandId === cmdId && recordingIndex === idx">
                  <span :class="$style.recordingText">入力待ち...</span>
                </template>
                <template v-else>
                  {{ formatShortcut(shortcut) }}
                  <button class="_button" :class="$style.removeShortcut" @click.stop="removeShortcut(cmdId, idx)">
                    <i class="ti ti-x" />
                  </button>
                </template>
              </div>
            </template>
            <button
              v-if="recordingCommandId === cmdId && recordingIndex >= keybindsStore.getShortcuts(cmdId).length"
              class="_button"
              :class="[$style.shortcutBadge, $style.recording]"
              tabindex="0"
              @keydown="onKeyDown($event, cmdId, recordingIndex)"
            >
              <span :class="$style.recordingText">入力待ち...</span>
            </button>
            <button class="_button" :class="$style.addShortcutBtn" @click="addShortcut(cmdId)" title="ショートカットを追加">
              <i class="ti ti-plus" />
            </button>
          </div>
          <button
            v-if="keybindsStore.isCustomized(cmdId)"
            class="_button"
            :class="$style.resetBtn"
            title="デフォルトに戻す"
            @click="resetCommand(cmdId)"
          >
            <i class="ti ti-restore" />
          </button>
        </div>
      </template>
    </div>
  </div>
</template>

<style lang="scss" module>
.keybindsContent {
  padding: 16px;
}

.keybindsHeader {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 16px;
}

.keybindsTitle {
  font-weight: bold;
  font-size: 0.95em;
  color: var(--nd-fgHighlighted);
}

.resetAllBtn {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 0.8em;
  color: var(--nd-fg);
  opacity: 0.7;
  padding: 4px 8px;
  border-radius: 4px;
  transition: opacity var(--nd-duration-base);

  &:hover {
    opacity: 1;
    background: var(--nd-buttonHoverBg);
  }
}

.categoryHeader {
  font-size: 0.75em;
  font-weight: bold;
  color: var(--nd-fg);
  opacity: 0.5;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  padding: 12px 0 4px;

  &:first-child {
    padding-top: 0;
  }
}

.keybindRow {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 8px;
  border-radius: var(--nd-radius-sm);
  transition: background var(--nd-duration-fast);

  &:hover {
    background: color-mix(in srgb, var(--nd-accent) 8%, transparent);
  }

  &.customized {
    background: color-mix(in srgb, var(--nd-accent) 5%, transparent);
  }
}

.keybindLabel {
  flex: 1;
  font-size: 0.85em;
  color: var(--nd-fg);
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.keybindShortcuts {
  display: flex;
  align-items: center;
  gap: 4px;
  flex-wrap: wrap;
}

.shortcutBadge {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px 8px;
  background: var(--nd-buttonBg, rgba(0, 0, 0, 0.1));
  border: 1px solid var(--nd-divider);
  border-radius: 4px;
  font-size: 0.75em;
  font-family: monospace;
  color: var(--nd-fg);
  cursor: pointer;
  transition: border-color var(--nd-duration-base), background var(--nd-duration-base);
  outline: none;
  min-height: 26px;

  &:hover {
    border-color: var(--nd-accent);
  }

  &:focus {
    border-color: var(--nd-accent);
    box-shadow: 0 0 0 2px color-mix(in srgb, var(--nd-accent) 30%, transparent);
  }

  &.recording {
    border-color: var(--nd-accent);
    background: var(--nd-accent-hover);
    animation: pulse 1s infinite;
  }

  &:hover .removeShortcut {
    opacity: 0.6;
  }
}

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.7; }
}

.recordingText {
  font-style: italic;
  font-family: inherit;
  font-size: 1em;
  color: var(--nd-accent);
}

.removeShortcut {
  display: flex;
  align-items: center;
  font-size: 0.9em;
  opacity: 0;
  color: var(--nd-fg);
  transition: opacity var(--nd-duration-base);

  &:hover {
    opacity: 1 !important;
    color: var(--nd-love, #ec4137);
  }
}

.addShortcutBtn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border-radius: 4px;
  font-size: 0.8em;
  color: var(--nd-fg);
  opacity: 0.4;
  transition: opacity var(--nd-duration-base), background var(--nd-duration-base);

  &:hover {
    opacity: 1;
    background: var(--nd-buttonHoverBg);
  }
}

.resetBtn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border-radius: 4px;
  font-size: 0.85em;
  color: var(--nd-fg);
  opacity: 0.4;
  transition: opacity var(--nd-duration-base), background var(--nd-duration-base);
  flex-shrink: 0;

  &:hover {
    opacity: 1;
    background: var(--nd-buttonHoverBg);
  }
}

.customized {}
.recording {}
</style>
