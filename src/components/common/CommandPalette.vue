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
const inputWrapRef = ref<HTMLElement | null>(null)
const dropdownPos = ref({ top: 0, left: 0, width: 0 })

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

function updateDropdownPos() {
  if (inputWrapRef.value) {
    const rect = inputWrapRef.value.getBoundingClientRect()
    dropdownPos.value = {
      top: rect.bottom + 4,
      left: rect.left,
      width: rect.width,
    }
  }
}

watch(query, () => {
  selectedIndex.value = 0
})

watch(selectedIndex, () => {
  nextTick(() => {
    const el = document.querySelector('.palette-item.selected')
    el?.scrollIntoView({ block: 'nearest' })
  })
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
        updateDropdownPos()
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
  { immediate: true },
)

function primaryShortcut(cmd: Command): string | null {
  const s =
    cmd.shortcuts.find((s) => s.ctrl || s.shift || s.alt) ?? cmd.shortcuts[0]
  return s ? shortcutLabel(s) : null
}
</script>

<template>
  <!--
    VS Code integrated architecture:
    - Input lives in the titlebar (inline, same position as URI display)
    - Dropdown list is Teleported to body (avoids ancestor overflow clipping)
  -->

  <!-- Background overlay (Teleported) -->
  <Teleport to="body">
    <div class="palette-overlay-bg" @click="commandStore.close()" />
  </Teleport>

  <!-- Input: lives in the titlebar DOM, replaces URI display -->
  <div ref="inputWrapRef" class="palette-input-wrap" @keydown="onKeydown">
    <i class="ti ti-search palette-input-icon" />
    <input
      ref="inputRef"
      v-model="query"
      class="palette-input"
      placeholder="コマンドを入力..."
      spellcheck="false"
    />
    <kbd class="palette-input-kbd">Esc</kbd>
  </div>

  <!-- Dropdown list (Teleported to body — scroll works regardless of ancestors) -->
  <Teleport to="body">
    <div
      class="palette-dropdown"
      :style="{
        top: dropdownPos.top + 'px',
        left: dropdownPos.left + 'px',
        width: dropdownPos.width + 'px',
      }"
      @click.stop
      @keydown="onKeydown"
    >
      <!-- CLI mode -->
      <div v-if="cliMatch && cliMeta" class="palette-cli">
        <div class="palette-cli-row">
          <i :class="'ti ti-' + cliMeta.icon" class="palette-item-icon" />
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
        <div class="palette-cli-desc">{{ cliMeta.about }}</div>
      </div>

      <!-- Command list -->
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
            <kbd v-if="primaryShortcut(cmd)" class="palette-item-kbd">
              {{ primaryShortcut(cmd) }}
            </kbd>
          </button>
        </template>
      </div>

      <div v-else class="palette-empty">一致するコマンドがありません</div>
    </div>
  </Teleport>
</template>

<style scoped>
/* ========================================
   Background overlay
   ======================================== */
.palette-overlay-bg {
  position: fixed;
  inset: 0;
  z-index: 2549;
  background: rgba(0, 0, 0, 0.08);
}

/* ========================================
   Input (lives in titlebar, same slot as URI)
   Matches TitleBar .titlebarSearchBar dimensions.
   ======================================== */
.palette-input-wrap {
  display: flex;
  align-items: center;
  gap: 6px;
  width: 100%;
  height: 22px;
  padding: 0 8px;
  border: 1px solid var(--nd-accent, #86b300);
  border-radius: var(--nd-radius-sm);
  background: rgba(255, 255, 255, 0.1);
  color: var(--nd-fg);
}

.palette-input-icon {
  font-size: 12px;
  opacity: 0.5;
  flex-shrink: 0;
}

.palette-input {
  flex: 1;
  background: none;
  border: none;
  outline: none;
  color: var(--nd-fg);
  font-size: 12px;
  font-family: inherit;
  line-height: 20px;
  min-width: 0;
}

.palette-input::placeholder {
  color: var(--nd-fg);
  opacity: 0.4;
}

.palette-input-kbd {
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

/* ========================================
   Dropdown (Teleported to body, position: fixed)
   ======================================== */
.palette-dropdown {
  position: fixed;
  z-index: 2550;
  background: var(--nd-popup, #252526);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 0 0 var(--nd-radius-sm) var(--nd-radius-sm);
  box-shadow:
    0 6px 20px rgba(0, 0, 0, 0.4),
    0 0 0 1px rgba(0, 0, 0, 0.15);
}

/* ========================================
   List (scroll container)
   ======================================== */
.palette-list {
  max-height: calc(20 * 22px);
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
  border-left: 2px solid transparent;
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
  border-left-color: var(--nd-accent, #86b300);
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
</style>
