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
const isFollowingSystem = computed(() => themeStore.manualMode == null)
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

function toggleDarkMode() {
  themeStore.toggleTheme()
}

function toggleSyncDevice(e: Event) {
  const checked = (e.target as HTMLInputElement).checked
  if (checked) {
    themeStore.resetToOsTheme()
  } else {
    themeStore.pinCurrentMode()
  }
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
      <!-- Misskey-style day/night toggle panel -->
      <div class="theme-panel">
        <div class="toggle-area">
          <div class="toggle-inner">
            <div class="day-night-toggle" :class="{ checked: isDark }" @click="toggleDarkMode">
              <span class="label-before">Light</span>
              <span class="label-after">Dark</span>
              <span class="toggle-handler">
                <span class="crater crater-1" />
                <span class="crater crater-2" />
                <span class="crater crater-3" />
              </span>
              <span class="star star-1" />
              <span class="star star-2" />
              <span class="star star-3" />
              <span class="star star-4" />
              <span class="star star-5" />
              <span class="star star-6" />
            </div>
          </div>
        </div>
        <div class="sync-area">
          <label class="sync-label">
            <span class="sync-toggle" :class="{ active: isFollowingSystem }">
              <input type="checkbox" :checked="isFollowingSystem" @change="toggleSyncDevice" />
              <span class="sync-toggle-track">
                <span class="sync-toggle-knob" />
              </span>
            </span>
            <span class="sync-text">デバイスのダークモードに同期</span>
          </label>
        </div>
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
  min-width: 260px;
}

/* ── Theme panel (toggle + sync in one block) ── */

.theme-panel {
  border-radius: 6px;
}

.toggle-area {
  position: relative;
  padding: 22px 0;
  text-align: center;
}

.toggle-inner {
  display: inline-block;
  text-align: left;
  padding: 0 66px;
  vertical-align: bottom;
}

.day-night-toggle {
  cursor: pointer;
  display: inline-block;
  position: relative;
  width: 90px;
  height: 50px;
  margin: 4px;
  background-color: #83d8ff;
  border-radius: 42px;
  transition: background-color 200ms cubic-bezier(0.445, 0.05, 0.55, 0.95);
}

.day-night-toggle.checked {
  background-color: #749dd6;
}

/* Light / Dark labels */
.label-before,
.label-after {
  position: absolute;
  top: 15px;
  transition: color 1s ease;
  font-size: 0.85em;
  user-select: none;
  white-space: nowrap;
}

.label-before {
  left: -56px;
  color: var(--nd-accent);
}

.label-after {
  right: -52px;
  color: var(--nd-fg);
}

.day-night-toggle.checked .label-before {
  color: var(--nd-fg);
}

.day-night-toggle.checked .label-after {
  color: var(--nd-accent);
}

/* Sun/Moon handler */
.toggle-handler {
  display: inline-block;
  position: relative;
  z-index: 1;
  top: 3px;
  left: 3px;
  width: 44px;
  height: 44px;
  background-color: #ffcf96;
  border-radius: 50px;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.3);
  transition: all 400ms cubic-bezier(0.68, -0.55, 0.265, 1.55);
  transform: rotate(-45deg);
}

.day-night-toggle.checked .toggle-handler {
  background-color: #ffe5b5;
  transform: translate3d(40px, 0, 0) rotate(0);
}

/* Moon craters */
.crater {
  position: absolute;
  background-color: #e8cda5;
  opacity: 0;
  transition: opacity 200ms ease-in-out;
  border-radius: 100%;
}

.crater-1 {
  top: 18px;
  left: 10px;
  width: 4px;
  height: 4px;
}

.crater-2 {
  top: 28px;
  left: 22px;
  width: 6px;
  height: 6px;
}

.crater-3 {
  top: 10px;
  left: 25px;
  width: 8px;
  height: 8px;
}

.day-night-toggle.checked .crater {
  opacity: 1;
}

/* Stars / Sun rays */
.star {
  position: absolute;
  background-color: #fff;
  transition: all 300ms cubic-bezier(0.445, 0.05, 0.55, 0.95);
  border-radius: 50%;
}

.star-1 {
  top: 10px;
  left: 35px;
  z-index: 0;
  width: 30px;
  height: 3px;
}

.star-2 {
  top: 18px;
  left: 28px;
  z-index: 1;
  width: 30px;
  height: 3px;
}

.star-3 {
  top: 27px;
  left: 40px;
  z-index: 0;
  width: 30px;
  height: 3px;
}

.day-night-toggle.checked .star-1 {
  width: 2px;
  height: 2px;
}

.day-night-toggle.checked .star-2 {
  width: 4px;
  height: 4px;
  transform: translate3d(-5px, 0, 0);
}

.day-night-toggle.checked .star-3 {
  width: 2px;
  height: 2px;
  transform: translate3d(-7px, 0, 0);
}

.star-4,
.star-5,
.star-6 {
  opacity: 0;
  transition: all 300ms 0ms cubic-bezier(0.445, 0.05, 0.55, 0.95);
}

.star-4 {
  top: 16px;
  left: 11px;
  z-index: 0;
  width: 2px;
  height: 2px;
  transform: translate3d(3px, 0, 0);
}

.star-5 {
  top: 32px;
  left: 17px;
  z-index: 0;
  width: 3px;
  height: 3px;
  transform: translate3d(3px, 0, 0);
}

.star-6 {
  top: 36px;
  left: 28px;
  z-index: 0;
  width: 2px;
  height: 2px;
  transform: translate3d(3px, 0, 0);
}

.day-night-toggle.checked .star-4,
.day-night-toggle.checked .star-5,
.day-night-toggle.checked .star-6 {
  opacity: 1;
  transform: translate3d(0, 0, 0);
}

.day-night-toggle.checked .star-4 {
  transition: all 300ms 200ms cubic-bezier(0.445, 0.05, 0.55, 0.95);
}

.day-night-toggle.checked .star-5 {
  transition: all 300ms 300ms cubic-bezier(0.445, 0.05, 0.55, 0.95);
}

.day-night-toggle.checked .star-6 {
  transition: all 300ms 400ms cubic-bezier(0.445, 0.05, 0.55, 0.95);
}

/* ── Sync device dark mode (Misskey-style MkSwitch) ── */

.sync-area {
  padding: 12px 16px;
  border-top: solid 0.5px var(--nd-divider);
}

.sync-label {
  display: flex;
  align-items: center;
  gap: 10px;
  cursor: pointer;
  font-size: 0.85em;
  color: var(--nd-fg);
}

.sync-toggle {
  position: relative;
  flex-shrink: 0;
}

.sync-toggle input {
  position: absolute;
  opacity: 0;
  width: 0;
  height: 0;
}

.sync-toggle-track {
  display: block;
  width: 40px;
  height: 22px;
  background: var(--nd-buttonBg, rgba(0, 0, 0, 0.15));
  border-radius: 11px;
  position: relative;
  transition: background 0.2s;
}

.sync-toggle.active .sync-toggle-track {
  background: var(--nd-accent);
}

.sync-toggle-knob {
  position: absolute;
  top: 2px;
  left: 2px;
  width: 18px;
  height: 18px;
  background: #fff;
  border-radius: 50%;
  transition: transform 0.2s;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.2);
}

.sync-toggle.active .sync-toggle-knob {
  transform: translateX(18px);
}

.sync-text {
  user-select: none;
  line-height: 1.3;
}

/* ── Menu items (wallpaper etc.) ── */

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
