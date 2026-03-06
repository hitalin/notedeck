<script setup lang="ts">
import { version as appVersion } from '../../../package.json'
import { computed, nextTick, ref, watch } from 'vue'
import ThemePreview from '@/components/ThemePreview.vue'
import { useDeckStore } from '@/stores/deck'
import { useThemeStore } from '@/stores/theme'
import { useWindowsStore } from '@/stores/windows'
import { DARK_THEME, LIGHT_THEME } from '@/theme/builtinThemes'
import { highlightCode } from '@/utils/highlight'

const props = defineProps<{
  show: boolean
}>()

const emit = defineEmits<{
  close: []
}>()

const deckStore = useDeckStore()
const themeStore = useThemeStore()
const windowsStore = useWindowsStore()
const isDark = computed(() => !themeStore.currentSource?.kind.includes('light'))
const isFollowingSystem = computed(() => themeStore.manualMode == null)
const fileInput = ref<HTMLInputElement | null>(null)

// Theme install UI
const showInstallInput = ref(false)
const themeCode = ref('')
const installError = ref('')

// Current mode's builtin theme
const builtinTheme = computed(() => (isDark.value ? DARK_THEME : LIGHT_THEME))

// Installed themes filtered by current mode
const currentModeThemes = computed(() => {
  const mode = isDark.value ? 'dark' : 'light'
  return themeStore.installedThemes.filter((t) => t.base === mode)
})

// Currently selected theme ID for the active mode
const selectedId = computed(() =>
  isDark.value
    ? themeStore.selectedDarkThemeId
    : themeStore.selectedLightThemeId,
)

function selectTheme(id: string | null) {
  const mode = isDark.value ? 'dark' : 'light'
  themeStore.selectTheme(id, mode)
}

function handleInstall() {
  installError.value = ''
  if (!themeCode.value.trim()) return
  const ok = themeStore.installTheme(themeCode.value.trim())
  if (ok) {
    themeCode.value = ''
    showInstallInput.value = false
  } else {
    installError.value = '無効なテーマJSONです'
  }
}

function removeTheme(id: string) {
  themeStore.removeTheme(id)
}

watch(
  () => props.show,
  (val) => {
    if (val) {
      nextTick(() => {
        document.addEventListener('click', handleOutsideClick, { once: true })
      })
    } else {
      showInstallInput.value = false
      themeCode.value = ''
      installError.value = ''
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

// Custom CSS
const showCustomCss = ref(false)
const customCssInput = ref(themeStore.customCss)

function saveCustomCss() {
  themeStore.setCustomCss(customCssInput.value)
}

function clearCustomCss() {
  customCssInput.value = ''
  themeStore.setCustomCss('')
}

const highlightedCss = computed(() => {
  const code = customCssInput.value
  if (!code) return ''
  return highlightCode(code, 'css')
})

function syncScroll(e: Event) {
  const textarea = e.target as HTMLTextAreaElement
  const highlight = textarea.parentElement?.querySelector(
    '.css-highlight',
  ) as HTMLElement | null
  if (highlight) {
    highlight.scrollTop = textarea.scrollTop
    highlight.scrollLeft = textarea.scrollLeft
  }
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

      <!-- Theme selection grid -->
      <div class="theme-select-section">
        <div class="theme-select-header">
          <i :class="isDark ? 'ti ti-moon' : 'ti ti-sun'" />
          <span>{{ isDark ? 'ダークテーマ' : 'ライトテーマ' }}</span>
        </div>
        <div class="theme-grid">
          <!-- Builtin theme -->
          <div class="theme-item" :class="{ selected: selectedId == null }" @click="selectTheme(null)">
            <ThemePreview :theme="builtinTheme" class="theme-item-preview" />
            <div class="theme-item-name">{{ builtinTheme.name }}</div>
          </div>
          <!-- Installed themes -->
          <div
            v-for="theme in currentModeThemes"
            :key="theme.id"
            class="theme-item"
            :class="{ selected: selectedId === theme.id }"
            @click="selectTheme(theme.id)"
            @contextmenu.prevent="removeTheme(theme.id)"
          >
            <ThemePreview :theme="theme" class="theme-item-preview" />
            <div class="theme-item-name">{{ theme.name }}</div>
          </div>
        </div>

        <!-- Install theme -->
        <div v-if="!showInstallInput" class="install-btn" @click="showInstallInput = true">
          <i class="ti ti-download" />
          <span>テーマをインストール</span>
        </div>
        <div v-else class="install-area">
          <textarea
            v-model="themeCode"
            class="install-textarea"
            placeholder="MisskeyテーマのJSONコードを貼り付け..."
            rows="4"
          />
          <div v-if="installError" class="install-error">{{ installError }}</div>
          <div class="install-actions">
            <button class="install-action-btn cancel" @click="showInstallInput = false">キャンセル</button>
            <button class="install-action-btn confirm" @click="handleInstall">インストール</button>
          </div>
        </div>
      </div>

      <!-- Custom CSS -->
      <div class="settings-menu-divider" />

      <div v-if="!showCustomCss" class="settings-menu-item" @click="showCustomCss = true">
        <i class="ti ti-code" />
        <span class="settings-menu-label">カスタムCSS</span>
        <span v-if="themeStore.customCss" class="css-active-dot" />
      </div>
      <div v-else class="custom-css-section">
        <div class="custom-css-header">
          <i class="ti ti-code" />
          <span>カスタムCSS</span>
        </div>
        <div class="css-editor">
          <div class="css-highlight" v-html="highlightedCss" />
          <textarea
            v-model="customCssInput"
            class="custom-css-textarea"
            placeholder=":root { cursor: auto; }&#10;body { font-family: ... }"
            rows="6"
            spellcheck="false"
            @scroll="syncScroll"
          />
        </div>
        <div class="custom-css-actions">
          <button v-if="themeStore.customCss" class="install-action-btn cancel" @click="clearCustomCss">クリア</button>
          <button class="install-action-btn cancel" @click="showCustomCss = false">閉じる</button>
          <button class="install-action-btn confirm" @click="saveCustomCss">適用</button>
        </div>
      </div>

      <div class="settings-menu-divider" />

      <div class="settings-menu-item" @click="windowsStore.open('keybinds')">
        <i class="ti ti-keyboard" />
        <span class="settings-menu-label">キーバインド設定</span>
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

      <div class="settings-menu-divider" />
      <div class="version-info">v{{ appVersion }}</div>
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
  max-height: 80vh;
  overflow-y: auto;
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

/* ── Sync device dark mode ── */

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

/* ── Theme selection grid ── */

.theme-select-section {
  padding: 8px 12px;
}

.theme-select-header {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 0.8em;
  color: var(--nd-fg);
  opacity: 0.7;
  margin-bottom: 8px;
  padding: 0 4px;
}

.theme-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(100px, 1fr));
  gap: 8px;
}

.theme-item {
  cursor: pointer;
  border: 2px solid var(--nd-divider);
  border-radius: 6px;
  overflow: hidden;
  transition: border-color 0.15s;
}

.theme-item:hover {
  border-color: color-mix(in srgb, var(--nd-accent) 50%, var(--nd-divider));
}

.theme-item.selected {
  border-color: var(--nd-accent);
}

.theme-item-preview {
  display: block;
  width: calc(100% + 2px);
  margin-left: -1px;
  height: auto;
  border-bottom: 1px solid var(--nd-divider);
}

.theme-item-name {
  padding: 4px 6px;
  text-align: center;
  font-size: 0.75em;
  color: var(--nd-fg);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* ── Install theme ── */

.install-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 4px;
  margin-top: 8px;
  cursor: pointer;
  font-size: 0.8em;
  color: var(--nd-fg);
  opacity: 0.7;
  border-radius: 4px;
  transition: opacity 0.15s;
}

.install-btn:hover {
  opacity: 1;
}

.install-area {
  margin-top: 8px;
}

.install-textarea {
  width: 100%;
  box-sizing: border-box;
  background: var(--nd-buttonBg, rgba(0, 0, 0, 0.1));
  border: 1px solid var(--nd-divider);
  border-radius: 6px;
  padding: 8px;
  font-size: 0.8em;
  color: var(--nd-fg);
  resize: vertical;
  font-family: monospace;
  min-height: 60px;
}

.install-textarea:focus {
  outline: none;
  border-color: var(--nd-accent);
}

.install-textarea::placeholder {
  color: var(--nd-fg);
  opacity: 0.4;
}

.install-error {
  font-size: 0.75em;
  color: var(--nd-error, #ec4137);
  margin-top: 4px;
  padding: 0 2px;
}

.install-actions {
  display: flex;
  gap: 6px;
  margin-top: 6px;
  justify-content: flex-end;
}

.install-action-btn {
  padding: 4px 12px;
  border: none;
  border-radius: 4px;
  font-size: 0.8em;
  cursor: pointer;
  transition: opacity 0.15s;
}

.install-action-btn.cancel {
  background: var(--nd-buttonBg, rgba(0, 0, 0, 0.1));
  color: var(--nd-fg);
}

.install-action-btn.confirm {
  background: var(--nd-accent);
  color: var(--nd-fgOnAccent, #fff);
}

.install-action-btn:hover {
  opacity: 0.85;
}

/* ── Custom CSS ── */

.css-active-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--nd-accent);
  margin-left: auto;
}

.custom-css-section {
  padding: 8px 12px;
}

.custom-css-header {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 0.8em;
  color: var(--nd-fg);
  opacity: 0.7;
  margin-bottom: 8px;
  padding: 0 4px;
}

.css-editor {
  position: relative;
  border: 1px solid var(--nd-divider);
  border-radius: 6px;
  overflow: hidden;
  background: var(--nd-buttonBg, rgba(0, 0, 0, 0.1));
  transition: border-color 0.15s;
}

.css-editor:focus-within {
  border-color: var(--nd-accent);
}

.css-highlight {
  position: absolute;
  inset: 0;
  overflow: hidden;
  pointer-events: none;
  padding: 8px;
  font-size: 0.8em;
  font-family: monospace;
  line-height: 1.4;
  tab-size: 2;
  white-space: pre-wrap;
  word-wrap: break-word;
}

.css-highlight :deep(pre) {
  margin: 0;
  padding: 0;
  background: transparent !important;
  font-size: inherit;
  font-family: inherit;
  line-height: inherit;
}

.css-highlight :deep(code) {
  font-family: inherit;
  line-height: inherit;
}

.custom-css-textarea {
  position: relative;
  width: 100%;
  box-sizing: border-box;
  background: transparent;
  border: none;
  padding: 8px;
  font-size: 0.8em;
  color: transparent;
  caret-color: var(--nd-fg);
  resize: vertical;
  font-family: monospace;
  line-height: 1.4;
  min-height: 80px;
  tab-size: 2;
  z-index: 1;
}

.custom-css-textarea:focus {
  outline: none;
}

.custom-css-textarea::placeholder {
  color: var(--nd-fg);
  opacity: 0.4;
}

.custom-css-actions {
  display: flex;
  gap: 6px;
  margin-top: 6px;
  justify-content: flex-end;
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

.version-info {
  text-align: center;
  padding: 4px 16px 8px;
  font-size: 0.75em;
  color: var(--nd-fg);
  opacity: 0.4;
  user-select: text;
}

.settings-menu-enter-from,
.settings-menu-leave-to {
  opacity: 0;
  transform: translateY(4px);
}
</style>
