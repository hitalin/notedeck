<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { useDeckStore } from '@/stores/deck'
import { useThemeStore } from '@/stores/theme'

const props = defineProps<{
  show: boolean
}>()

const emit = defineEmits<{
  close: []
}>()

const deckStore = useDeckStore()
const themeStore = useThemeStore()
const isDark = computed(() => !themeStore.currentSource?.kind.includes('light'))
const fileInput = ref<HTMLInputElement | null>(null)

watch(
  () => props.show,
  (val) => {
    if (val) {
      nextTick(() => {
        document.addEventListener('click', handleOutsideClick, { once: true })
      })
    }
  },
)

function handleOutsideClick() {
  emit('close')
}

function pickWallpaper() {
  fileInput.value?.click()
}

function onFileSelected(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0]
  if (!file) return
  const reader = new FileReader()
  reader.onload = () => {
    deckStore.setWallpaper(reader.result as string)
  }
  reader.readAsDataURL(file)
  if (fileInput.value) fileInput.value.value = ''
}

function removeWallpaper() {
  deckStore.clearWallpaper()
}
</script>

<template>
  <Transition name="settings-menu">
    <div v-if="show" class="settings-menu" @click.stop>
      <div class="settings-menu-item" @click="themeStore.toggleTheme()">
        <i :class="isDark ? 'ti ti-sun' : 'ti ti-moon'" />
        <span class="settings-menu-label">{{ isDark ? 'Light theme' : 'Dark theme' }}</span>
      </div>
      <div v-if="themeStore.manualMode != null" class="settings-menu-item" @click="themeStore.resetToOsTheme()">
        <i class="ti ti-device-desktop" />
        <span class="settings-menu-label">Follow system theme</span>
      </div>

      <div class="settings-menu-divider" />

      <div v-if="deckStore.wallpaper == null" class="settings-menu-item" @click="pickWallpaper">
        <i class="ti ti-photo" />
        <span class="settings-menu-label">Set wallpaper</span>
      </div>
      <div v-else class="settings-menu-item" @click="removeWallpaper">
        <i class="ti ti-photo-off" />
        <span class="settings-menu-label">Remove wallpaper</span>
      </div>

      <input
        ref="fileInput"
        type="file"
        accept="image/*"
        style="display: none"
        @change="onFileSelected"
      />
    </div>
  </Transition>
</template>

<style scoped>
.settings-menu {
  position: absolute;
  bottom: 100%;
  right: 0;
  margin-bottom: 4px;
  background: var(--nd-popup, var(--nd-panelBg));
  border-radius: 8px;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.15);
  backdrop-filter: blur(16px);
  padding: 8px 0;
  z-index: 100;
  min-width: 180px;
}

.settings-menu-item {
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

.settings-menu-item::before {
  content: '';
  display: block;
  position: absolute;
  inset: 2px 8px;
  border-radius: 6px;
  transition: background 0.1s;
}

.settings-menu-item:hover::before {
  background: color-mix(in srgb, var(--nd-accent) 15%, transparent);
}

.settings-menu-divider {
  height: 1px;
  background: var(--nd-divider);
  margin: 4px 12px;
}

.settings-menu-label {
  position: relative;
}

.settings-menu-item i {
  position: relative;
}

.settings-menu-enter-active,
.settings-menu-leave-active {
  transition: opacity 0.15s, transform 0.15s;
}

.settings-menu-enter-from,
.settings-menu-leave-to {
  opacity: 0;
  transform: translateY(4px);
}
</style>
