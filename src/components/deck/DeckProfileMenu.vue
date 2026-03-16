<script setup lang="ts">
import type { CSSProperties } from 'vue'
import { ref, watch } from 'vue'
import { refreshProfileCommands } from '@/commands/definitions'
import { switchProfileWithWindows } from '@/composables/useDeckWindow'
import type { DeckProfile } from '@/stores/deck'
import { useDeckStore } from '@/stores/deck'
import { useIsCompactLayout } from '@/stores/ui'

const props = defineProps<{
  show: boolean
  anchor?: HTMLElement | null
}>()

const emit = defineEmits<{
  close: []
}>()

const deckStore = useDeckStore()
const isCompact = useIsCompactLayout()

const profiles = ref<DeckProfile[]>([])
const editingId = ref<string | null>(null)
const editingName = ref('')
const menuEl = ref<HTMLElement | null>(null)
const fixedStyle = ref<CSSProperties | undefined>()

watch(
  () => props.show,
  (val) => {
    if (val) {
      if (props.anchor) {
        const rect = props.anchor.getBoundingClientRect()
        fixedStyle.value = {
          position: 'fixed',
          bottom: `${window.innerHeight - rect.top + 4}px`,
          left: `${rect.left}px`,
        }
      } else {
        fixedStyle.value = undefined
      }
      profiles.value = deckStore.getProfiles()
      editingId.value = null
    }
  },
  { immediate: true },
)

function createProfile() {
  deckStore.saveAsProfile()
  profiles.value = deckStore.getProfiles()
  refreshProfileCommands()
}

function apply(id: string) {
  if (editingId.value === id) return
  switchProfileWithWindows(id)
  profiles.value = deckStore.getProfiles()
}

function startRename(id: string, name: string) {
  editingId.value = id
  editingName.value = name
}

function commitRename() {
  if (editingId.value) {
    const trimmed = editingName.value.trim()
    if (trimmed) {
      deckStore.renameProfile(editingId.value, trimmed)
      profiles.value = deckStore.getProfiles()
      refreshProfileCommands()
    }
    editingId.value = null
  }
}

function remove(id: string) {
  deckStore.deleteProfile(id)
  profiles.value = deckStore.getProfiles()
  refreshProfileCommands()
}
</script>

<template>
  <Teleport to="body">
  <div v-if="show" :class="$style.menuBackdrop" @pointerdown="emit('close')" />
  <Transition name="profile-menu">
    <div v-if="show" ref="menuEl" :class="[$style.profileMenu, { [$style.mobile]: isCompact }]" :style="fixedStyle" class="_popupMenu" @pointerdown.stop>
      <div :class="$style.list">
        <div
          v-for="p in profiles"
          :key="p.id"
          :class="[$style.item, { [$style.active]: p.id === deckStore.windowProfileId }]"
          @click="apply(p.id)"
        >
          <input
            v-if="editingId === p.id"
            v-model="editingName"
            :class="$style.renameInput"
            @blur="commitRename"
            @click.stop
            @keydown.enter.prevent="($event.target as HTMLInputElement).blur()"
            @vue:mounted="({ el }: { el: HTMLInputElement }) => { el.focus(); el.select() }"
          />
          <span v-else :class="$style.name">{{ p.name }}</span>
          <button
            class="_button"
            :class="$style.action"
            title="名前変更"
            @click.stop="startRename(p.id, p.name)"
          >
            <i class="ti ti-edit" />
          </button>
          <button
            class="_button"
            :class="[$style.action, $style.deleteAction]"
            title="削除"
            @click.stop="remove(p.id)"
          >
            <i class="ti ti-trash" />
          </button>
        </div>
      </div>

      <div v-if="profiles.length === 0" :class="$style.empty">
        保存されたプロファイルはありません
      </div>

      <div :class="$style.divider" />

      <div :class="[$style.item, $style.newItem]" @click="createProfile">
        <i class="ti ti-plus" />
        <span>新規プロファイル</span>
      </div>

    </div>
  </Transition>
  </Teleport>
</template>

<style lang="scss" module>
.menuBackdrop {
  position: fixed;
  inset: 0;
  z-index: var(--nd-z-popup);
}

.profileMenu {
  z-index: calc(var(--nd-z-popup) + 1);
  bottom: 100%;
  left: 0;
  margin-bottom: 4px;
  min-width: 180px;
  max-width: 260px;
}

.list {
  padding: 2px 0;
}

.item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 16px;
  cursor: pointer;
  font-size: 0.9em;
  line-height: 20px;
  color: var(--nd-fg);
  position: relative;

  &::before {
    content: '';
    display: block;
    position: absolute;
    inset: 2px 8px;
    border-radius: var(--nd-radius-sm);
    transition: background var(--nd-duration-fast);
  }

  &:hover::before {
    background: var(--nd-accent-hover);
  }
}

.active {
  color: var(--nd-accent);
  font-weight: 600;

  &::before {
    background: var(--nd-accent-subtle);
  }
}

.name {
  flex: 1;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  position: relative;
}

.renameInput {
  flex: 1;
  min-width: 0;
  font-size: inherit;
  line-height: inherit;
  color: var(--nd-fg);
  background: var(--nd-accent-subtle);
  border: 1px solid var(--nd-accent);
  border-radius: 4px;
  padding: 2px 6px;
  position: relative;
  outline: none;
}

.action {
  display: none;
  flex-shrink: 0;
  color: var(--nd-fg);
  opacity: 0.4;
  padding: 2px;
  position: relative;
  transition: opacity var(--nd-duration-fast);

  .item:hover & {
    display: flex;
  }

  &:hover {
    opacity: 1;
  }
}

.deleteAction {
  &:hover {
    color: var(--nd-love, #ff6b6b);
  }
}

.divider {
  height: 1px;
  background: var(--nd-divider);
  margin: 4px 12px;
}

.empty {
  padding: 12px 16px;
  font-size: 0.85em;
  color: var(--nd-fg);
  opacity: 0.4;
  text-align: center;
}

.newItem {
  opacity: 0.7;

  &:hover {
    opacity: 1;
  }

  i, span {
    position: relative;
  }
}

/* Mobile overrides */
.mobile {
  &.profileMenu {
    position: fixed;
    bottom: calc(50px + var(--nd-safe-area-bottom, env(safe-area-inset-bottom)));
    left: 8px;
    right: 8px;
    max-width: none;
    min-width: 0;
    border-radius: 12px;
    box-shadow: 0 -4px 24px rgba(0, 0, 0, 0.3);
    padding: 4px 0;
  }

  .item {
    padding: 10px 16px;
    min-height: 44px;
    font-size: 0.95em;
    gap: 12px;
  }

  .action {
    display: flex;
    padding: 8px;
  }

  .newItem {
    min-height: 44px;
    gap: 12px;
  }

  .divider {
    margin: 4px 12px;
  }

  .empty {
    padding: 16px;
  }
}
</style>

<style lang="scss">
/* Vue transition classes (must be global) */
.profile-menu-enter-active,
.profile-menu-leave-active {
  transition: opacity 0.18s ease, transform 0.18s ease;
}

.profile-menu-enter-from,
.profile-menu-leave-to {
  opacity: 0;
  transform: translateY(4px) scale(0.97);
}

@media (max-width: 500px) {
  .profile-menu-enter-from,
  .profile-menu-leave-to {
    transform: translateY(8px) scale(0.97);
  }
}
</style>
