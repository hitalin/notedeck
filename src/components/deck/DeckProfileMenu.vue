<script setup lang="ts">
import { nextTick, ref, watch } from 'vue'
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
const showInput = ref(false)
const newName = ref('')
const nameInput = ref<HTMLInputElement | null>(null)

watch(
  () => props.show,
  (val) => {
    if (val) {
      profiles.value = deckStore.getProfiles()
      showInput.value = false
      newName.value = ''
      nextTick(() => {
        document.addEventListener('click', handleOutsideClick, { once: true })
      })
    }
  },
)

function handleOutsideClick() {
  emit('close')
}

function startSave() {
  showInput.value = true
  nextTick(() => nameInput.value?.focus())
}

function confirmSave() {
  const name = newName.value.trim()
  if (!name) return
  deckStore.saveAsProfile(name)
  profiles.value = deckStore.getProfiles()
  showInput.value = false
  newName.value = ''
}

function apply(id: string) {
  deckStore.applyProfile(id)
  emit('close')
}

function remove(id: string) {
  deckStore.deleteProfile(id)
  profiles.value = deckStore.getProfiles()
}

</script>

<template>
  <Transition name="profile-menu">
    <div v-if="show" class="profile-menu" @click.stop>
      <div
        v-for="p in profiles"
        :key="p.id"
        class="profile-menu-item"
        :class="{ active: p.id === deckStore.activeProfileId }"
        @click="apply(p.id)"
      >
        <span class="profile-menu-name">{{ p.name }}</span>
        <button
          class="_button profile-menu-delete"
          title="Delete"
          @click.stop="remove(p.id)"
        >
          <i class="ti ti-trash" />
        </button>
      </div>

      <div v-if="profiles.length === 0" class="profile-menu-empty">
        No saved profiles
      </div>

      <div class="profile-menu-divider" />

      <div v-if="!showInput" class="profile-menu-item profile-menu-new" @click="startSave">
        <i class="ti ti-plus" />
        <span>New profile</span>
      </div>

      <div v-else class="profile-menu-input-row">
        <input
          ref="nameInput"
          v-model="newName"
          class="profile-menu-input"
          placeholder="Profile name"
          @keydown.enter="confirmSave"
          @keydown.escape="showInput = false"
        />
        <button class="_button profile-menu-confirm" :disabled="!newName.trim()" @click="confirmSave">
          <i class="ti ti-check" />
        </button>
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

.profile-menu-delete {
  display: none;
  flex-shrink: 0;
  color: var(--nd-fg);
  opacity: 0.4;
  padding: 2px;
  position: relative;
  transition: opacity 0.1s;
}

.profile-menu-item:hover .profile-menu-delete {
  display: flex;
}

.profile-menu-delete:hover {
  opacity: 1;
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

.profile-menu-input-row {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 4px 12px;
}

.profile-menu-input {
  flex: 1;
  background: var(--nd-buttonHoverBg);
  border: none;
  border-radius: 6px;
  padding: 6px 10px;
  font-size: 0.9em;
  color: var(--nd-fg);
  outline: none;
}

.profile-menu-input::placeholder {
  color: var(--nd-fg);
  opacity: 0.3;
}

.profile-menu-confirm {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border-radius: 6px;
  color: var(--nd-accent);
  transition: background 0.1s;
}

.profile-menu-confirm:hover:not(:disabled) {
  background: var(--nd-buttonHoverBg);
}

.profile-menu-confirm:disabled {
  opacity: 0.3;
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
</style>
