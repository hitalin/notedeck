<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { createCliHandlers } from '@/commands/cliHandlers'
import { getCliMeta, parseCliInput } from '@/commands/cliParser'
import type { Command } from '@/commands/registry'
import { useCommandStore } from '@/commands/registry'
import { useNavigation } from '@/composables/useNavigation'
import { useAccountsStore } from '@/stores/accounts'
import { useDeckStore } from '@/stores/deck'
import { useUiStore } from '@/stores/ui'
import { fuzzyMatch } from '@/utils/fuzzyMatch'
import { shortcutLabel } from '@/utils/shortcutLabel'

const props = withDefaults(defineProps<{ inline?: boolean }>(), {
  inline: false,
})

const { isDesktop } = useUiStore()
const commandStore = useCommandStore()
const query = ref('')
const selectedIndex = ref(0)
const inputRef = ref<HTMLInputElement | null>(null)

const cliMatch = computed(() => parseCliInput(query.value))
const cliMeta = computed(() =>
  cliMatch.value ? getCliMeta(cliMatch.value.name) : undefined,
)

const { navigateToNote, navigateToUser } = useNavigation()
const cliHandlers = createCliHandlers({
  deckStore: useDeckStore(),
  accountsStore: useAccountsStore(),
  navigateToNote,
  navigateToUser,
  toggleAccountMenu: () => commandStore.execute('account-menu'),
})

interface CommandGroup {
  category: string
  label: string
  commands: Command[]
}

const categoryLabels: Record<string, string> = {
  general: '全般',
  note: 'ノート',
  navigation: 'ナビゲーション',
  column: 'カラム',
  account: 'アカウント',
  window: 'ウィンドウ',
}

const categoryOrder = [
  'general',
  'note',
  'navigation',
  'column',
  'account',
  'window',
]

const filteredGroups = computed<CommandGroup[]>(() => {
  let enabled = commandStore.getEnabled().filter((c) => c.visible !== false)

  if (commandStore.commandFilter) {
    enabled = enabled.filter(commandStore.commandFilter)
  }

  const matched = query.value
    ? enabled.filter((c) => fuzzyMatch(query.value, c.label))
    : enabled

  const map = new Map<string, Command[]>()
  for (const cmd of matched) {
    const list = map.get(cmd.category) ?? []
    list.push(cmd)
    map.set(cmd.category, list)
  }

  const groups: CommandGroup[] = []
  for (const cat of categoryOrder) {
    const cmds = map.get(cat)
    if (cmds?.length) {
      groups.push({
        category: cat,
        label: categoryLabels[cat] ?? cat,
        commands: cmds,
      })
    }
  }
  return groups
})

const flatList = computed(() => filteredGroups.value.flatMap((g) => g.commands))

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'ArrowDown') {
    e.preventDefault()
    if (!cliMatch.value) {
      selectedIndex.value = Math.min(
        selectedIndex.value + 1,
        flatList.value.length - 1,
      )
    }
  } else if (e.key === 'ArrowUp') {
    e.preventDefault()
    if (!cliMatch.value) {
      selectedIndex.value = Math.max(selectedIndex.value - 1, 0)
    }
  } else if (e.key === 'Enter') {
    e.preventDefault()
    if (cliMatch.value) {
      const { name, args } = cliMatch.value
      const meta = getCliMeta(name)
      if (meta?.needsArgs && !args.trim()) return
      const handler = cliHandlers[name]
      if (!handler) return
      commandStore.close()
      handler(args)
    } else {
      const cmd = flatList.value[selectedIndex.value]
      if (cmd) {
        commandStore.close()
        cmd.execute()
      }
    }
  } else if (e.key === 'Escape') {
    e.preventDefault()
    commandStore.close()
  }
}

function runCommand(cmd: Command) {
  commandStore.close()
  cmd.execute()
}

watch(query, () => {
  selectedIndex.value = 0
})

watch(
  () => commandStore.isOpen,
  (open) => {
    if (open) {
      if (commandStore.initialInput) {
        query.value = commandStore.initialInput
        commandStore.initialInput = null
      } else {
        query.value = ''
      }
      selectedIndex.value = 0
      nextTick(() => {
        inputRef.value?.focus()
        if (query.value) {
          inputRef.value?.setSelectionRange(
            query.value.length,
            query.value.length,
          )
        }
      })
    }
  },
)

function primaryShortcut(cmd: Command): string | null {
  const s =
    cmd.shortcuts.find((s) => s.ctrl || s.shift || s.alt) ?? cmd.shortcuts[0]
  return s ? shortcutLabel(s) : null
}
</script>

<template>
  <!-- ===== INLINE MODE (Desktop TitleBar) ===== -->
  <template v-if="inline">
    <Teleport to="body">
      <div :class="$style.paletteOverlayBg" @click="commandStore.close()" />
    </Teleport>
    <div :class="$style.inlineWrap" @keydown="onKeydown">
      <div :class="$style.inlineInputWrap">
        <i class="ti ti-search" :class="$style.inlineSearchIcon" />
        <input
          ref="inputRef"
          v-model="query"
          :class="$style.inlineInput"
          placeholder="コマンドを入力..."
          spellcheck="false"
        />
        <kbd :class="$style.inlineKbd">Esc</kbd>
      </div>
      <div :class="$style.inlineDropdown" @click.stop>
        <!-- CLI mode -->
        <div v-if="cliMatch && cliMeta" :class="$style.paletteCli">
          <div :class="$style.paletteCliRow">
            <i :class="['ti ti-' + cliMeta.icon, $style.paletteItemIcon]" />
            <span v-if="cliMeta.needsArgs && !cliMatch.args.trim()" :class="$style.paletteCliHint">
              {{ cliMeta.usage }}
            </span>
            <span v-else :class="$style.paletteCliAction">
              ↵ Enterで実行: <strong>{{ cliMatch.name }}</strong> {{ cliMatch.args }}
            </span>
          </div>
          <div :class="$style.paletteCliDesc">{{ cliMeta.about }}</div>
        </div>
        <!-- Command list -->
        <div v-else-if="flatList.length" :class="$style.paletteList">
          <template v-for="(group, gi) in filteredGroups" :key="group.category">
            <div v-if="gi > 0" :class="$style.paletteSeparator" />
            <div :class="$style.paletteCategory">{{ group.label }}</div>
            <button
              v-for="cmd in group.commands"
              :key="cmd.id"
              :class="[$style.paletteItem, flatList[selectedIndex]?.id === cmd.id && $style.selected]"
              @click="runCommand(cmd)"
              @mouseenter="selectedIndex = flatList.indexOf(cmd)"
            >
              <i :class="['ti ti-' + cmd.icon, $style.paletteItemIcon]" />
              <span :class="$style.paletteItemLabel">{{ cmd.label }}</span>
              <kbd v-if="primaryShortcut(cmd)" :class="$style.paletteItemKbd">
                {{ primaryShortcut(cmd) }}
              </kbd>
            </button>
          </template>
        </div>
        <div v-else :class="$style.paletteEmpty">一致するコマンドがありません</div>
      </div>
    </div>
  </template>

  <!-- ===== DIALOG MODE (Mobile) ===== -->
  <div v-else :class="$style.paletteOverlay" @click="commandStore.close()">
    <div :class="$style.palette" @click.stop @keydown="onKeydown">
      <div :class="$style.paletteInputWrap">
        <span :class="$style.palettePrefix">&gt;</span>
        <input
          ref="inputRef"
          v-model="query"
          :class="$style.paletteInput"
          placeholder="コマンドを入力..."
          spellcheck="false"
        />
      </div>
      <!-- CLI mode -->
      <div v-if="cliMatch && cliMeta" :class="$style.paletteCli">
        <div :class="$style.paletteCliRow">
          <i :class="['ti ti-' + cliMeta.icon, $style.paletteItemIcon]" />
          <span v-if="cliMeta.needsArgs && !cliMatch.args.trim()" :class="$style.paletteCliHint">
            {{ cliMeta.usage }}
          </span>
          <span v-else :class="$style.paletteCliAction">
            ↵ Enterで実行: <strong>{{ cliMatch.name }}</strong> {{ cliMatch.args }}
          </span>
        </div>
        <div :class="$style.paletteCliDesc">{{ cliMeta.about }}</div>
      </div>
      <!-- Command list -->
      <div v-else-if="flatList.length" :class="$style.paletteList">
        <template v-for="(group, gi) in filteredGroups" :key="group.category">
          <div v-if="gi > 0" :class="$style.paletteSeparator" />
          <div :class="$style.paletteCategory">{{ group.label }}</div>
          <button
            v-for="cmd in group.commands"
            :key="cmd.id"
            :class="[$style.paletteItem, flatList[selectedIndex]?.id === cmd.id && $style.selected]"
            @click="runCommand(cmd)"
            @mouseenter="selectedIndex = flatList.indexOf(cmd)"
          >
            <i :class="['ti ti-' + cmd.icon, $style.paletteItemIcon]" />
            <span :class="$style.paletteItemLabel">{{ cmd.label }}</span>
            <kbd v-if="isDesktop && primaryShortcut(cmd)" :class="$style.paletteItemKbd">
              {{ primaryShortcut(cmd) }}
            </kbd>
          </button>
        </template>
      </div>
      <div v-else :class="$style.paletteEmpty">一致するコマンドがありません</div>
    </div>
  </div>
</template>

<style lang="scss" module>
/* ========================================
   INLINE MODE (Desktop TitleBar dropdown)
   ======================================== */
.paletteOverlayBg {
  position: fixed;
  inset: 0;
  z-index: calc(var(--nd-z-palette) - 1);
  background: rgba(0, 0, 0, 0.08);
}

.inlineWrap {
  position: relative;
  z-index: var(--nd-z-palette);
  flex: 1;
}

.inlineInputWrap {
  display: flex;
  align-items: center;
  gap: 6px;
  height: 22px;
  padding: 0 8px;
  border: 1px solid rgba(255, 255, 255, 0.25);
  border-radius: var(--nd-radius-sm);
  background: rgba(255, 255, 255, 0.1);
  color: var(--nd-fg);
}

.inlineSearchIcon {
  font-size: 12px;
  opacity: 0.5;
  flex-shrink: 0;
}

.inlineInput {
  flex: 1;
  background: none;
  border: none;
  outline: none;
  color: var(--nd-fg);
  font-size: 12px;
  font-family: inherit;
  line-height: 20px;
  min-width: 0;

  &::placeholder {
    color: var(--nd-fg);
    opacity: 0.4;
  }
}

.inlineKbd {
  font-size: 10px;
  padding: 0 4px;
  border-radius: 3px;
  background: rgba(255, 255, 255, 0.08);
  opacity: 0.4;
  font-family: inherit;
  border: none;
  flex-shrink: 0;
  line-height: 1.5;
}

.inlineDropdown {
  position: absolute;
  top: calc(100% + 4px);
  left: 0;
  right: 0;
  max-height: 400px;
  display: flex;
  flex-direction: column;
  background: var(--nd-popup, #252526);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: var(--nd-radius-sm);
  box-shadow:
    0 2px 8px rgba(0, 0, 0, 0.3),
    0 0 0 1px rgba(0, 0, 0, 0.15);
  overflow: hidden;
}

/* ========================================
   DIALOG MODE (Mobile fullscreen)
   ======================================== */
.paletteOverlay {
  position: fixed;
  inset: 0;
  z-index: var(--nd-z-palette);
  display: flex;
  justify-content: center;
  align-items: flex-start;
  background: rgba(0, 0, 0, 0.2);
}

.palette {
  width: 100%;
  max-width: 600px;
  max-height: 70vh;
  margin-top: calc(8px + var(--nd-safe-area-top, env(safe-area-inset-top)));
  margin-inline: 8px;
  display: flex;
  flex-direction: column;
  background: var(--nd-popup, #252526);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: var(--nd-radius-sm);
  box-shadow:
    0 2px 8px rgba(0, 0, 0, 0.3),
    0 0 0 1px rgba(0, 0, 0, 0.15);
  overflow: hidden;
}

.paletteInputWrap {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 10px 14px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
}

.palettePrefix {
  font-size: 14px;
  color: var(--nd-fg);
  opacity: 0.5;
  flex-shrink: 0;
  user-select: none;
}

.paletteInput {
  flex: 1;
  background: none;
  border: none;
  outline: none;
  color: var(--nd-fg);
  font-size: 14px;
  font-family: inherit;
  line-height: 22px;

  &::placeholder {
    color: var(--nd-fg);
    opacity: 0.35;
  }
}

/* ========================================
   SHARED (list items, CLI, etc.)
   ======================================== */
.paletteList {
  overflow-y: auto;
  padding: 4px 0;
  scrollbar-width: thin;
  scrollbar-color: rgba(255, 255, 255, 0.15) transparent;

  &::-webkit-scrollbar {
    width: 6px;
  }

  &::-webkit-scrollbar-track {
    background: transparent;
  }

  &::-webkit-scrollbar-thumb {
    background: rgba(255, 255, 255, 0.12);
    border-radius: 3px;
  }
}

.paletteSeparator {
  height: 1px;
  margin: 4px 0;
  background: rgba(255, 255, 255, 0.06);
}

.paletteCategory {
  padding: 6px 12px 2px;
  font-size: 11px;
  font-weight: 500;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--nd-fg);
  opacity: 0.45;
}

.paletteItem {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 4px 12px;
  border: none;
  border-left: 2px solid transparent;
  background: none;
  color: var(--nd-fg);
  font-size: 13px;
  font-family: inherit;
  cursor: pointer;
  text-align: left;
  line-height: 22px;
  min-height: 44px;
  padding: 8px 14px;

  &.selected {
    background: var(--nd-accentedBg, rgba(134, 179, 0, 0.12));
    border-left-color: var(--nd-accent, #86b300);

    .paletteItemIcon {
      opacity: 0.8;
    }
  }

  &:hover:not(.selected) {
    background: rgba(255, 255, 255, 0.04);
  }
}

.paletteItemIcon {
  font-size: 16px;
  opacity: 0.55;
  width: 20px;
  text-align: center;
  flex-shrink: 0;
}

.paletteItemLabel {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.paletteItemKbd {
  font-size: 11px;
  padding: 1px 5px;
  border-radius: 3px;
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid rgba(255, 255, 255, 0.1);
  opacity: 0.45;
  font-family: inherit;
  white-space: nowrap;
  line-height: 1.4;
}

.paletteEmpty {
  padding: 20px 12px;
  text-align: center;
  color: var(--nd-fg);
  opacity: 0.4;
  font-size: 13px;
}

.paletteCli {
  padding: 10px 12px;
}

.paletteCliRow {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  color: var(--nd-fg);
}

.paletteCliHint {
  opacity: 0.5;
  font-family: monospace;
  font-size: 12px;
}

.paletteCliAction {
  strong {
    color: var(--nd-accent);
  }
}

.paletteCliDesc {
  margin-top: 4px;
  padding-left: 28px;
  font-size: 12px;
  color: var(--nd-fg);
  opacity: 0.4;
}

@media (min-width: 501px) {
  .paletteItem {
    min-height: unset;
    padding: 4px 12px;
  }
}
</style>
