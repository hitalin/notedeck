<script setup lang="ts">
import { onBeforeUnmount, ref, watch } from 'vue'
import { refreshProfileCommands } from '@/commands/definitions'
import type { DeckProfile } from '@/stores/deck'
import { useDeckStore } from '@/stores/deck'

const props = defineProps<{
  show: boolean
}>()

const emit = defineEmits<{
  close: []
}>()

const deckStore = useDeckStore()

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
  deckStore.applyProfile(id)
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
    <div v-if="show" ref="menuEl" class="profile-menu" @pointerdown.stop>
      <div
        v-for="p in profiles"
        :key="p.id"
        class="profile-menu-item"
        :class="{ active: p.id === deckStore.windowProfileId }"
        @click="apply(p.id)"
      >
        <input
          v-if="editingId === p.id"
          v-model="editingName"
          class="profile-menu-rename-input"
          @blur="commitRename"
          @click.stop
          @keydown.enter.prevent="($event.target as HTMLInputElement).blur()"
          @vue:mounted="({ el }: { el: HTMLInputElement }) => { el.focus(); el.select() }"
        />
        <span v-else class="profile-menu-name">{{ p.name }}</span>
        <button
          class="_button profile-menu-action"
          title="名前変更"
          @click.stop="startRename(p.id, p.name)"
        >
          <i class="ti ti-edit" />
        </button>
        <button
          class="_button profile-menu-action profile-menu-delete"
          title="削除"
          @click.stop="remove(p.id)"
        >
          <i class="ti ti-trash" />
        </button>
      </div>

      <div v-if="profiles.length === 0" class="profile-menu-empty">
        保存されたプロファイルはありません
      </div>

      <div class="profile-menu-divider" />

      <div class="profile-menu-item profile-menu-new" @click="createProfile">
        <i class="ti ti-plus" />
        <span>新しいプロファイル</span>
      </div>

    </div>
  </Transition>
</template>

<style scoped>
.profile-menu {
  position: absolute;
  bottom: 100%;
  left: 0;
  margin-bottom: 4px;
  background: var(--nd-popup, var(--nd-panelBg));
  border-radius: 8px;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.15);
  backdrop-filter: blur(16px);
  padding: 8px 0;
  z-index: 100;
  min-width: 200px;
  max-width: 300px;
}

.profile-menu-empty {
  padding: 8px 16px;
  font-size: 0.9em;
  color: var(--nd-fg);
  opacity: 0.4;
  text-align: center;
}

.profile-menu-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 5px 16px;
  cursor: pointer;
  font-size: 0.9em;
  line-height: 20px;
  color: var(--nd-fg);
  position: relative;
}

.profile-menu-item::before {
  content: '';
  display: block;
  position: absolute;
  inset: 2px 8px;
  border-radius: 6px;
  transition: background 0.1s;
}

.profile-menu-item:hover::before {
  background: color-mix(in srgb, var(--nd-accent) 15%, transparent);
}

.profile-menu-item.active {
  color: var(--nd-accent);
  font-weight: 600;
}

.profile-menu-item.active::before {
  background: color-mix(in srgb, var(--nd-accent) 10%, transparent);
}

.profile-menu-name {
  flex: 1;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  position: relative;
}

.profile-menu-rename-input {
  flex: 1;
  min-width: 0;
  font-size: inherit;
  line-height: inherit;
  color: var(--nd-fg);
  background: color-mix(in srgb, var(--nd-accent) 10%, transparent);
  border: 1px solid var(--nd-accent);
  border-radius: 4px;
  padding: 0 4px;
  position: relative;
  outline: none;
}

.profile-menu-action {
  display: none;
  flex-shrink: 0;
  color: var(--nd-fg);
  opacity: 0.4;
  padding: 2px;
  position: relative;
  transition: opacity 0.1s;
}

.profile-menu-item:hover .profile-menu-action {
  display: flex;
}

.profile-menu-action:hover {
  opacity: 1;
}

.profile-menu-delete:hover {
  color: var(--nd-love, #ff6b6b);
}

.profile-menu-divider {
  border: 0;
  border-top: 0.5px solid var(--nd-divider);
  margin: 8px 0;
}

.profile-menu-new {
  opacity: 0.7;
}

.profile-menu-new:hover {
  opacity: 1;
}

.profile-menu-new i,
.profile-menu-new span {
  position: relative;
}

.profile-menu-enter-active,
.profile-menu-leave-active {
  transition: opacity 0.15s, transform 0.15s;
}

.profile-menu-enter-from,
.profile-menu-leave-to {
  opacity: 0;
  transform: translateY(4px);
}

@media (max-width: 500px) {
  .profile-menu {
    position: fixed;
    bottom: calc(50px + var(--nd-safe-area-bottom, env(safe-area-inset-bottom)));
    left: 8px;
    right: 8px;
    max-width: none;
    min-width: 0;
    border-radius: 12px;
    box-shadow: 0 -4px 24px rgba(0, 0, 0, 0.3);
  }

  .profile-menu-action {
    display: flex;
  }

  .profile-menu-enter-from,
  .profile-menu-leave-to {
    transform: translateY(8px);
  }
}
</style>
