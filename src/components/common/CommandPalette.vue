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
        <i class="ti ti-search palette-search-icon" />
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
        <template v-for="group in filteredGroups" :key="group.category">
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
  padding-top: 60px;
  background: rgba(0, 0, 0, 0.4);
  backdrop-filter: blur(2px);
}

.palette {
  width: 100%;
  max-width: 480px;
  max-height: 60vh;
  display: flex;
  flex-direction: column;
  background: var(--nd-popup, #363636);
  border: 1px solid var(--nd-divider);
  border-radius: 12px;
  box-shadow: 0 16px 48px rgba(0, 0, 0, 0.4);
  overflow: hidden;
  align-self: flex-start;
}

.palette-input-wrap {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 14px;
  border-bottom: 1px solid var(--nd-divider);
}

.palette-search-icon {
  font-size: 16px;
  color: var(--nd-fg);
  opacity: 0.4;
  flex-shrink: 0;
}

.palette-input {
  flex: 1;
  background: none;
  border: none;
  outline: none;
  color: var(--nd-fg);
  font-size: 14px;
  font-family: inherit;
}

.palette-input::placeholder {
  color: var(--nd-fg);
  opacity: 0.35;
}

.palette-esc {
  font-size: 11px;
  padding: 2px 6px;
  border-radius: 4px;
  background: rgba(255, 255, 255, 0.08);
  color: var(--nd-fg);
  opacity: 0.5;
  font-family: inherit;
  border: none;
}

.palette-list {
  overflow-y: auto;
  padding: 4px 0;
}

.palette-category {
  padding: 8px 14px 4px;
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--nd-fg);
  opacity: 0.4;
}

.palette-item {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 8px 14px;
  border: none;
  background: none;
  color: var(--nd-fg);
  font-size: 13px;
  font-family: inherit;
  cursor: pointer;
  text-align: left;
  transition: background 0.08s;
}

.palette-item.selected {
  background: var(--nd-accentedBg, rgba(134, 179, 0, 0.15));
}

.palette-item:hover {
  background: var(--nd-buttonHoverBg);
}

.palette-item-icon {
  font-size: 16px;
  opacity: 0.6;
  width: 20px;
  text-align: center;
  flex-shrink: 0;
}

.palette-item-label {
  flex: 1;
}

.palette-item-kbd {
  font-size: 11px;
  padding: 2px 6px;
  border-radius: 4px;
  background: rgba(255, 255, 255, 0.08);
  opacity: 0.5;
  font-family: inherit;
  border: none;
  white-space: nowrap;
}

.palette-empty {
  padding: 20px 14px;
  text-align: center;
  color: var(--nd-fg);
  opacity: 0.4;
  font-size: 13px;
}

.palette-cli {
  padding: 12px 14px;
}

.palette-cli-row {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 13px;
  color: var(--nd-fg);
}

.palette-cli-hint {
  opacity: 0.5;
  font-family: monospace;
}

.palette-cli-action strong {
  color: var(--nd-accent);
}

.palette-cli-desc {
  margin-top: 6px;
  padding-left: 30px;
  font-size: 12px;
  color: var(--nd-fg);
  opacity: 0.45;
}

@media (max-width: 500px) {
  .palette-overlay {
    padding-top: 20px;
    padding-inline: 8px;
  }

  .palette {
    max-height: 70vh;
  }

  .palette-overlay {
    padding-top: calc(20px + env(safe-area-inset-top));
  }

  .palette-item {
    padding: 10px 14px;
    min-height: 44px;
  }
}
</style>
