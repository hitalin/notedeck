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
}

const categoryOrder = ['general', 'note', 'navigation', 'column', 'account']

const filteredGroups = computed<CommandGroup[]>(() => {
  const enabled = commandStore.getEnabled().filter((c) => c.visible !== false)

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
  <div class="palette-overlay" @click="commandStore.close()">
    <div class="palette" @click.stop @keydown="onKeydown">
      <div class="palette-input-wrap">
        <span class="palette-prefix">&gt;</span>
        <input
          ref="inputRef"
          v-model="query"
          class="palette-input"
          placeholder="コマンドを入力..."
          spellcheck="false"
        />
        <kbd v-if="isDesktop" class="palette-esc">Esc</kbd>
      </div>
      <!-- CLI mode -->
      <div v-if="cliMatch && cliMeta" class="palette-cli">
        <div class="palette-cli-row">
          <i
            :class="'ti ti-' + cliMeta.icon"
            class="palette-item-icon"
          />
          <span
            v-if="cliMeta.needsArgs && !cliMatch.args.trim()"
            class="palette-cli-hint"
          >
            {{ cliMeta.usage }}
          </span>
          <span v-else class="palette-cli-action">
            ↵ Enterで実行:
            <strong>{{ cliMatch.name }}</strong>
            {{ cliMatch.args }}
          </span>
        </div>
        <div class="palette-cli-desc">
          {{ cliMeta.about }}
        </div>
      </div>
      <!-- Normal command list -->
      <div v-else-if="flatList.length" class="palette-list">
        <template v-for="(group, gi) in filteredGroups" :key="group.category">
          <div v-if="gi > 0" class="palette-separator" />
          <div class="palette-category">{{ group.label }}</div>
          <button
            v-for="cmd in group.commands"
            :key="cmd.id"
            class="palette-item"
            :class="{ selected: flatList[selectedIndex]?.id === cmd.id }"
            @click="runCommand(cmd)"
            @mouseenter="selectedIndex = flatList.indexOf(cmd)"
          >
            <i :class="'ti ti-' + cmd.icon" class="palette-item-icon" />
            <span class="palette-item-label">{{ cmd.label }}</span>
            <kbd v-if="isDesktop && primaryShortcut(cmd)" class="palette-item-kbd">
              {{ primaryShortcut(cmd) }}
            </kbd>
          </button>
        </template>
      </div>
      <div v-else class="palette-empty">一致するコマンドがありません</div>
    </div>
  </div>
</template>

<style scoped>
.palette-overlay {
  position: fixed;
  inset: 0;
  z-index: 99999;
  display: flex;
  justify-content: center;
  align-items: flex-start;
  background: rgba(0, 0, 0, 0.08);
}

.palette {
  width: 100%;
  max-width: 600px;
  max-height: 440px;
  margin-top: 50px;
  display: flex;
  flex-direction: column;
  background: var(--nd-popup, #252526);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 6px;
  box-shadow:
    0 2px 8px rgba(0, 0, 0, 0.3),
    0 0 0 1px rgba(0, 0, 0, 0.15);
  overflow: hidden;
}

/* --- Input --- */
.palette-input-wrap {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 6px 10px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
}

.palette-prefix {
  font-size: 14px;
  color: var(--nd-fg);
  opacity: 0.5;
  flex-shrink: 0;
  user-select: none;
}

.palette-input {
  flex: 1;
  background: none;
  border: none;
  outline: none;
  color: var(--nd-fg);
  font-size: 14px;
  font-family: inherit;
  line-height: 22px;
}

.palette-input::placeholder {
  color: var(--nd-fg);
  opacity: 0.35;
}

.palette-esc {
  font-size: 10px;
  padding: 1px 5px;
  border-radius: 3px;
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid rgba(255, 255, 255, 0.1);
  color: var(--nd-fg);
  opacity: 0.45;
  font-family: inherit;
  line-height: 1.4;
}

/* --- List --- */
.palette-list {
  overflow-y: auto;
  padding: 4px 0;
  scrollbar-width: thin;
  scrollbar-color: rgba(255, 255, 255, 0.15) transparent;
}

.palette-list::-webkit-scrollbar {
  width: 6px;
}

.palette-list::-webkit-scrollbar-track {
  background: transparent;
}

.palette-list::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.12);
  border-radius: 3px;
}

.palette-separator {
  height: 1px;
  margin: 4px 0;
  background: rgba(255, 255, 255, 0.06);
}

.palette-category {
  padding: 6px 12px 2px;
  font-size: 11px;
  font-weight: 500;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--nd-fg);
  opacity: 0.45;
}

.palette-item {
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
}

.palette-item.selected {
  background: var(--nd-accentedBg, rgba(134, 179, 0, 0.12));
  border-left-color: var(--nd-accent, #86b300);
}

.palette-item:hover:not(.selected) {
  background: rgba(255, 255, 255, 0.04);
}

.palette-item-icon {
  font-size: 16px;
  opacity: 0.55;
  width: 20px;
  text-align: center;
  flex-shrink: 0;
}

.palette-item.selected .palette-item-icon {
  opacity: 0.8;
}

.palette-item-label {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.palette-item-kbd {
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

/* --- Empty / CLI --- */
.palette-empty {
  padding: 20px 12px;
  text-align: center;
  color: var(--nd-fg);
  opacity: 0.4;
  font-size: 13px;
}

.palette-cli {
  padding: 10px 12px;
}

.palette-cli-row {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  color: var(--nd-fg);
}

.palette-cli-hint {
  opacity: 0.5;
  font-family: monospace;
  font-size: 12px;
}

.palette-cli-action strong {
  color: var(--nd-accent);
}

.palette-cli-desc {
  margin-top: 4px;
  padding-left: 28px;
  font-size: 12px;
  color: var(--nd-fg);
  opacity: 0.4;
}

/* --- Mobile --- */
@media (max-width: 500px) {
  .palette-overlay {
    background: rgba(0, 0, 0, 0.2);
  }

  .palette {
    margin-top: 0;
    max-height: 70vh;
    border-radius: 0 0 6px 6px;
    margin-inline: 8px;
    margin-top: calc(8px + env(safe-area-inset-top));
  }

  .palette-input-wrap {
    padding: 10px 14px;
  }

  .palette-item {
    padding: 8px 14px;
    min-height: 44px;
    border-left: none;
  }
}
</style>
