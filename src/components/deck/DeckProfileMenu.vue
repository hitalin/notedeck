<script setup lang="ts">
import { onBeforeUnmount, ref, watch } from 'vue'
import { refreshProfileCommands } from '@/commands/definitions'
import { switchProfileWithWindows } from '@/composables/useDeckWindow'
import type { DeckProfile } from '@/stores/deck'
import { useDeckStore } from '@/stores/deck'
import { useIsMobile } from '@/stores/ui'

const props = defineProps<{
  show: boolean
}>()

const emit = defineEmits<{
  close: []
}>()

const deckStore = useDeckStore()
const isMobile = useIsMobile()

const profiles = ref<DeckProfile[]>([])
const editingId = ref<string | null>(null)
const editingName = ref('')
const menuEl = ref<HTMLElement | null>(null)

function handlePointerDown(e: PointerEvent) {
  if (menuEl.value && !menuEl.value.contains(e.target as Node)) {
    emit('close')
  }
}

function addOutsideClickListener() {
  document.addEventListener('pointerdown', handlePointerDown)
}

function removeOutsideClickListener() {
  document.removeEventListener('pointerdown', handlePointerDown)
}

watch(
  () => props.show,
  (val) => {
    if (val) {
      profiles.value = deckStore.getProfiles()
      editingId.value = null
      addOutsideClickListener()
    } else {
      removeOutsideClickListener()
    }
  },
)

onBeforeUnmount(() => {
  removeOutsideClickListener()
})

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
  <Transition name="profile-menu">
    <div v-if="show" ref="menuEl" :class="[$style.profileMenu, { [String($style.mobile)]: isMobile }]" class="_popupMenu" @pointerdown.stop>
      <div
        v-for="p in profiles"
        :key="p.id"
        :class="[$style.profileMenuItem, { [String($style.active)]: p.id === deckStore.windowProfileId }]"
        @click="apply(p.id)"
      >
        <input
          v-if="editingId === p.id"
          v-model="editingName"
          :class="$style.profileMenuRenameInput"
          @blur="commitRename"
          @click.stop
          @keydown.enter.prevent="($event.target as HTMLInputElement).blur()"
          @vue:mounted="({ el }: { el: HTMLInputElement }) => { el.focus(); el.select() }"
        />
        <span v-else :class="$style.profileMenuName">{{ p.name }}</span>
        <button
          class="_button"
          :class="$style.profileMenuAction"
          title="名前変更"
          @click.stop="startRename(p.id, p.name)"
        >
          <i class="ti ti-edit" />
        </button>
        <button
          class="_button"
          :class="[$style.profileMenuAction, $style.profileMenuDelete]"
          title="削除"
          @click.stop="remove(p.id)"
        >
          <i class="ti ti-trash" />
        </button>
      </div>

      <div v-if="profiles.length === 0" :class="$style.profileMenuEmpty">
        保存されたプロファイルはありません
      </div>

      <div :class="$style.profileMenuDivider" />

      <div :class="[$style.profileMenuItem, $style.profileMenuNew]" @click="createProfile">
        <i class="ti ti-plus" />
        <span>新しいプロファイル</span>
      </div>

    </div>
  </Transition>
</template>

<style lang="scss" module>
.profileMenu {
  bottom: 100%;
  left: 0;
  margin-bottom: 4px;
  min-width: 200px;
  max-width: 300px;
}

.profileMenuEmpty {
  padding: 8px 16px;
  font-size: 0.9em;
  color: var(--nd-fg);
  opacity: 0.4;
  text-align: center;
}

.profileMenuItem {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 5px 16px;
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

.profileMenuName {
  flex: 1;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  position: relative;
}

.profileMenuRenameInput {
  flex: 1;
  min-width: 0;
  font-size: inherit;
  line-height: inherit;
  color: var(--nd-fg);
  background: var(--nd-accent-subtle);
  border: 1px solid var(--nd-accent);
  border-radius: 4px;
  padding: 0 4px;
  position: relative;
  outline: none;
}

.profileMenuAction {
  display: none;
  flex-shrink: 0;
  color: var(--nd-fg);
  opacity: 0.4;
  padding: 2px;
  position: relative;
  transition: opacity var(--nd-duration-fast);

  .profileMenuItem:hover & {
    display: flex;
  }

  &:hover {
    opacity: 1;
  }
}

.profileMenuDelete {
  &:hover {
    color: var(--nd-love, #ff6b6b);
  }
}

.profileMenuDivider {
  border: 0;
  border-top: 0.5px solid var(--nd-divider);
  margin: 8px 0;
}

.profileMenuNew {
  opacity: 0.7;

  &:hover {
    opacity: 1;
  }

  i, span {
    position: relative;
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

<style lang="scss" module>
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
  }

  .profileMenuAction {
    display: flex;
  }
}
</style>
