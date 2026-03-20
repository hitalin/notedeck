<script setup lang="ts">
import type { CSSProperties } from 'vue'
import { computed, ref, watch } from 'vue'
import AboutDialog from '@/components/common/AboutDialog.vue'
import ThemePreview from '@/components/ThemePreview.vue'
import { useUpdater } from '@/composables/useUpdater'
import { useDeckStore } from '@/stores/deck'
import { useThemeStore } from '@/stores/theme'
import { useIsCompactLayout } from '@/stores/ui'
import { DARK_THEME, LIGHT_THEME } from '@/theme/builtinThemes'
import { hapticSelection } from '@/utils/haptics'
import { version as appVersion } from '../../../package.json'

const props = defineProps<{
  show: boolean
  anchor?: HTMLElement | null
}>()

const emit = defineEmits<{
  close: []
}>()

const { updateAvailable, updateVersion, isInstalling, installUpdate } =
  useUpdater()

const isCompact = useIsCompactLayout()
const deckStore = useDeckStore()
const themeStore = useThemeStore()
const isDark = computed(() => !themeStore.currentSource?.kind.includes('light'))
const isFollowingSystem = computed(() => themeStore.manualMode == null)
const fileInput = ref<HTMLInputElement | null>(null)
const showAbout = ref(false)
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

async function handleInstall() {
  installError.value = ''
  if (!themeCode.value.trim()) return
  const ok = await themeStore.installTheme(themeCode.value.trim())
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
          right: `${window.innerWidth - rect.right}px`,
        }
      } else {
        fixedStyle.value = undefined
      }
    } else {
      showInstallInput.value = false
      themeCode.value = ''
      installError.value = ''
    }
  },
  { immediate: true },
)

function toggleDarkMode() {
  themeStore.toggleTheme()
}

function toggleSyncDevice(e: Event) {
  hapticSelection()
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

// Open editor column (CSS / keybinds)
function openEditorColumn(type: 'cssEditor' | 'keybindsEditor', name: string) {
  const existing = deckStore.columns.find((c) => c.type === type)
  if (!existing) {
    deckStore.addColumn({
      type,
      name,
      width: 360,
      accountId: null,
      active: true,
    })
  }
  emit('close')
}
</script>

<template>
  <Teleport to="body">
  <div v-if="show" :class="$style.menuBackdrop" @pointerdown="emit('close')" />
  <Transition name="settings-menu">
    <div v-if="show" ref="menuEl" :class="[$style.settingsMenu, { [$style.mobile]: isCompact }]" :style="fixedStyle" class="_popupMenu" @pointerdown.stop>
      <div :class="$style.menuBody">
      <!-- Misskey-style day/night toggle panel -->
      <div :class="$style.themePanel">
        <div :class="$style.toggleArea">
          <div :class="$style.toggleInner">
            <div :class="[$style.dayNightToggle, { [$style.checked]: isDark }]" @click="toggleDarkMode">
              <span :class="$style.labelBefore">ライト</span>
              <span :class="$style.labelAfter">ダーク</span>
              <span :class="$style.toggleHandler">
                <span :class="[$style.crater, $style.crater1]" />
                <span :class="[$style.crater, $style.crater2]" />
                <span :class="[$style.crater, $style.crater3]" />
              </span>
              <span :class="[$style.star, $style.star1]" />
              <span :class="[$style.star, $style.star2]" />
              <span :class="[$style.star, $style.star3]" />
              <span :class="[$style.star, $style.star4]" />
              <span :class="[$style.star, $style.star5]" />
              <span :class="[$style.star, $style.star6]" />
            </div>
          </div>
        </div>
        <div :class="$style.syncArea">
          <label :class="$style.syncLabel">
            <span :class="[$style.syncToggle, { [$style.active]: isFollowingSystem }]">
              <input type="checkbox" :checked="isFollowingSystem" @change="toggleSyncDevice" />
              <span :class="$style.syncToggleTrack">
                <span :class="$style.syncToggleKnob" />
              </span>
            </span>
            <span :class="$style.syncText">デバイスのダークモードに同期</span>
          </label>
        </div>
      </div>

      <!-- Theme selection grid -->
      <div :class="$style.themeSelectSection">
        <div :class="$style.themeSelectHeader">
          <i :class="isDark ? 'ti ti-moon' : 'ti ti-sun'" />
          <span>{{ isDark ? 'ダークテーマ' : 'ライトテーマ' }}</span>
        </div>
        <div :class="$style.themeGrid">
          <!-- Builtin theme -->
          <div :class="[$style.themeItem, { [$style.selected]: selectedId == null }]" @click="selectTheme(null)">
            <ThemePreview :theme="builtinTheme" :class="$style.themeItemPreview" />
            <div :class="$style.themeItemName">{{ builtinTheme.name }}</div>
          </div>
          <!-- Installed themes -->
          <div
            v-for="theme in currentModeThemes"
            :key="theme.id"
            :class="[$style.themeItem, { [$style.selected]: selectedId === theme.id }]"
            @click="selectTheme(theme.id)"
            @contextmenu.prevent="removeTheme(theme.id)"
          >
            <ThemePreview :theme="theme" :class="$style.themeItemPreview" />
            <div :class="$style.themeItemName">{{ theme.name }}</div>
          </div>
        </div>

        <!-- Install theme -->
        <div v-if="!showInstallInput" :class="$style.installBtn" @click="showInstallInput = true">
          <i class="ti ti-download" />
          <span>テーマをインストール</span>
        </div>
        <div v-else :class="$style.installArea">
          <textarea
            v-model="themeCode"
            :class="$style.installTextarea"
            placeholder="MisskeyテーマのJSONコードを貼り付け..."
            rows="4"
          />
          <div v-if="installError" :class="$style.installError">{{ installError }}</div>
          <div :class="$style.installActions">
            <button :class="[$style.installActionBtn, $style.cancel]" @click="showInstallInput = false">キャンセル</button>
            <button :class="[$style.installActionBtn, $style.confirm]" @click="handleInstall">インストール</button>
          </div>
        </div>
      </div>

      <!-- Editor columns -->
      <div :class="$style.settingsMenuDivider" />

      <div :class="$style.settingsMenuItem" @click="openEditorColumn('cssEditor', 'カスタムCSS')">
        <i class="ti ti-code" />
        <span :class="$style.settingsMenuLabel">カスタムCSS</span>
        <span v-if="themeStore.customCss" :class="$style.cssActiveDot" />
      </div>

      <div :class="$style.settingsMenuDivider" />

      <div v-if="deckStore.wallpaper == null" :class="$style.settingsMenuItem" @click="pickWallpaper">
        <i class="ti ti-photo" />
        <span :class="$style.settingsMenuLabel">壁紙を設定</span>
      </div>
      <div v-else :class="$style.settingsMenuItem" @click="removeWallpaper">
        <i class="ti ti-photo-off" />
        <span :class="$style.settingsMenuLabel">壁紙を削除</span>
      </div>

      <input
        ref="fileInput"
        type="file"
        accept="image/*"
        style="display: none"
        @change="onFileSelected"
      />

      <div :class="$style.settingsMenuDivider" />

      <div :class="$style.settingsMenuItem" @click="openEditorColumn('keybindsEditor', 'キーバインド')">
        <i class="ti ti-keyboard" />
        <span :class="$style.settingsMenuLabel">キーバインド設定</span>
      </div>

      </div>
      <div :class="$style.menuFooter">
        <div :class="$style.settingsMenuDivider" />
        <div v-if="updateAvailable" :class="$style.updateSection">
          <div :class="$style.updateText">
            <span :class="$style.updateVersion">v{{ appVersion }} → v{{ updateVersion }}</span>
          </div>
          <button
            :class="$style.updateBtn"
            :disabled="isInstalling"
            @click="installUpdate"
          >
            {{ isInstalling ? 'インストール中...' : 'アップデート' }}
          </button>
        </div>
        <button v-else :class="$style.versionInfo" @click="showAbout = true">v{{ appVersion }}</button>
      </div>
    </div>
  </Transition>
  </Teleport>
  <AboutDialog :show="showAbout" @close="showAbout = false" />
</template>

<style lang="scss" module>
.menuBackdrop {
  position: fixed;
  inset: 0;
  z-index: var(--nd-z-popup) !important;
}

.settingsMenu {
  z-index: calc(var(--nd-z-popup) + 1) !important;
  bottom: 100%;
  right: 0;
  margin-bottom: 4px;
  min-width: 260px;
  max-height: 80vh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.menuBody {
  flex: 1;
  overflow-y: auto;
  min-height: 0;
}

.menuFooter {
  flex-shrink: 0;
}

/* -- Theme panel (toggle + sync in one block) -- */

.themePanel {
  border-radius: var(--nd-radius-sm);
}

.toggleArea {
  position: relative;
  padding: 22px 0;
  text-align: center;
}

.toggleInner {
  display: inline-block;
  text-align: left;
  padding: 0 66px;
  vertical-align: bottom;
}

.dayNightToggle {
  cursor: pointer;
  display: inline-block;
  position: relative;
  width: 90px;
  height: 50px;
  margin: 4px;
  background-color: #83d8ff;
  border-radius: 42px;
  transition: background-color 200ms cubic-bezier(0.445, 0.05, 0.55, 0.95);

  &.checked {
    background-color: #749dd6;
  }
}

/* Light / Dark labels */
.labelBefore,
.labelAfter {
  position: absolute;
  top: 15px;
  transition: color 1s ease;
  font-size: 0.85em;
  user-select: none;
  white-space: nowrap;
}

.labelBefore {
  left: -56px;
  color: var(--nd-accent);

  .checked & {
    color: var(--nd-fg);
  }
}

.labelAfter {
  right: -52px;
  color: var(--nd-fg);

  .checked & {
    color: var(--nd-accent);
  }
}

/* Sun/Moon handler */
.toggleHandler {
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

  .checked & {
    background-color: #ffe5b5;
    transform: translate3d(40px, 0, 0) rotate(0);
  }
}

/* Moon craters */
.crater {
  position: absolute;
  background-color: #e8cda5;
  opacity: 0;
  transition: opacity 200ms ease-in-out;
  border-radius: 100%;

  .checked & {
    opacity: 1;
  }
}

.crater1 {
  top: 18px;
  left: 10px;
  width: 4px;
  height: 4px;
}

.crater2 {
  top: 28px;
  left: 22px;
  width: 6px;
  height: 6px;
}

.crater3 {
  top: 10px;
  left: 25px;
  width: 8px;
  height: 8px;
}

/* Stars / Sun rays */
.star {
  position: absolute;
  background-color: #fff;
  transition: all 300ms cubic-bezier(0.445, 0.05, 0.55, 0.95);
  border-radius: 50%;
}

.star1 {
  top: 10px;
  left: 35px;
  z-index: 0;
  width: 30px;
  height: 3px;

  .checked & {
    width: 2px;
    height: 2px;
  }
}

.star2 {
  top: 18px;
  left: 28px;
  z-index: 1;
  width: 30px;
  height: 3px;

  .checked & {
    width: 4px;
    height: 4px;
    transform: translate3d(-5px, 0, 0);
  }
}

.star3 {
  top: 27px;
  left: 40px;
  z-index: 0;
  width: 30px;
  height: 3px;

  .checked & {
    width: 2px;
    height: 2px;
    transform: translate3d(-7px, 0, 0);
  }
}

.star4,
.star5,
.star6 {
  opacity: 0;
  transition: all 300ms 0ms cubic-bezier(0.445, 0.05, 0.55, 0.95);
}

.star4 {
  top: 16px;
  left: 11px;
  z-index: 0;
  width: 2px;
  height: 2px;
  transform: translate3d(3px, 0, 0);

  .checked & {
    opacity: 1;
    transform: translate3d(0, 0, 0);
    transition: all 300ms 200ms cubic-bezier(0.445, 0.05, 0.55, 0.95);
  }
}

.star5 {
  top: 32px;
  left: 17px;
  z-index: 0;
  width: 3px;
  height: 3px;
  transform: translate3d(3px, 0, 0);

  .checked & {
    opacity: 1;
    transform: translate3d(0, 0, 0);
    transition: all 300ms 300ms cubic-bezier(0.445, 0.05, 0.55, 0.95);
  }
}

.star6 {
  top: 36px;
  left: 28px;
  z-index: 0;
  width: 2px;
  height: 2px;
  transform: translate3d(3px, 0, 0);

  .checked & {
    opacity: 1;
    transform: translate3d(0, 0, 0);
    transition: all 300ms 400ms cubic-bezier(0.445, 0.05, 0.55, 0.95);
  }
}

/* -- Sync device dark mode -- */

.syncArea {
  padding: 12px 16px;
  border-top: solid 0.5px var(--nd-divider);
}

.syncLabel {
  display: flex;
  align-items: center;
  gap: 10px;
  cursor: pointer;
  font-size: 0.85em;
  color: var(--nd-fg);
}

.syncToggle {
  position: relative;
  flex-shrink: 0;

  input {
    position: absolute;
    opacity: 0;
    width: 0;
    height: 0;
  }
}

.syncToggleTrack {
  display: block;
  width: 40px;
  height: 22px;
  background: var(--nd-buttonBg, rgba(0, 0, 0, 0.15));
  border-radius: 11px;
  position: relative;
  transition: background var(--nd-duration-slow);

  .active & {
    background: var(--nd-accent);
  }
}

.syncToggleKnob {
  position: absolute;
  top: 2px;
  left: 2px;
  width: 18px;
  height: 18px;
  background: #fff;
  border-radius: 50%;
  transition: transform var(--nd-duration-slow);
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.2);

  .active & {
    transform: translateX(18px);
  }
}

.syncText {
  user-select: none;
  line-height: 1.3;
}

/* -- Theme selection grid -- */

.themeSelectSection {
  padding: 8px 12px;
}

.themeSelectHeader {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 0.8em;
  color: var(--nd-fg);
  opacity: 0.7;
  margin-bottom: 8px;
  padding: 0 4px;
}

.themeGrid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(100px, 1fr));
  gap: 8px;
}

.themeItem {
  cursor: pointer;
  border: 2px solid var(--nd-divider);
  border-radius: var(--nd-radius-sm);
  overflow: hidden;
  transition: border-color var(--nd-duration-base);

  &:hover {
    border-color: color-mix(in srgb, var(--nd-accent) 50%, var(--nd-divider));
  }
}

.selected {
  border-color: var(--nd-accent);
}

.themeItemPreview {
  display: block;
  width: calc(100% + 2px);
  margin-left: -1px;
  height: auto;
  border-bottom: 1px solid var(--nd-divider);
}

.themeItemName {
  padding: 4px 6px;
  text-align: center;
  font-size: 0.75em;
  color: var(--nd-fg);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* -- Install theme -- */

.installBtn {
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
  transition: opacity var(--nd-duration-base);

  &:hover {
    opacity: 1;
  }
}

.installArea {
  margin-top: 8px;
}

.installTextarea {
  width: 100%;
  box-sizing: border-box;
  background: var(--nd-buttonBg, rgba(0, 0, 0, 0.1));
  border: 1px solid var(--nd-divider);
  border-radius: var(--nd-radius-sm);
  padding: 8px;
  font-size: 0.8em;
  color: var(--nd-fg);
  resize: vertical;
  font-family: monospace;
  min-height: 60px;

  &:focus {
    outline: none;
    border-color: var(--nd-accent);
  }

  &::placeholder {
    color: var(--nd-fg);
    opacity: 0.4;
  }
}

.installError {
  font-size: 0.75em;
  color: var(--nd-error, #ec4137);
  margin-top: 4px;
  padding: 0 2px;
}

.installActions {
  display: flex;
  gap: 6px;
  margin-top: 6px;
  justify-content: flex-end;
}

.installActionBtn {
  padding: 4px 12px;
  border: none;
  border-radius: 4px;
  font-size: 0.8em;
  cursor: pointer;
  transition: opacity var(--nd-duration-base);

  &:hover {
    opacity: 0.85;
  }
}

.cancel {
  background: var(--nd-buttonBg, rgba(0, 0, 0, 0.1));
  color: var(--nd-fg);
}

.confirm {
  background: var(--nd-accent);
  color: var(--nd-fgOnAccent, #fff);
}

/* -- Custom CSS -- */

.cssActiveDot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--nd-accent);
  margin-left: auto;
}

/* -- Menu items (wallpaper etc.) -- */

.settingsMenuItem {
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

  i {
    position: relative;
  }
}

.settingsMenuDivider {
  height: 1px;
  background: var(--nd-divider);
  margin: 4px 12px;
}

.settingsMenuLabel {
  position: relative;
}

.versionInfo {
  display: block;
  width: 100%;
  border: none;
  background: none;
  text-align: center;
  padding: 4px 16px 8px;
  font-size: 0.75em;
  color: var(--nd-fg);
  opacity: 0.4;
  cursor: pointer;
  transition: opacity var(--nd-duration-base);

  &:hover {
    opacity: 0.7;
  }
}

.updateSection {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 16px;
}

.updateText {
  flex: 1;
  min-width: 0;
}

.updateVersion {
  font-size: 0.8em;
  color: var(--nd-accent);
  font-weight: 500;
}

.updateBtn {
  flex-shrink: 0;
  padding: 4px 12px;
  border: none;
  border-radius: 4px;
  background: var(--nd-accent);
  color: var(--nd-fgOnAccent, #fff);
  font-size: 0.8em;
  cursor: pointer;
  white-space: nowrap;
  transition: opacity var(--nd-duration-base);

  &:hover:not(:disabled) {
    opacity: 0.85;
  }

  &:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
}

.mobile {
  position: fixed;
  bottom: calc(50px + var(--nd-safe-area-bottom, env(safe-area-inset-bottom)));
  left: 8px;
  right: auto;
  width: 234px;
  max-width: none;
  min-width: 0;
  border-radius: 12px;
  box-shadow: 0 -4px 24px rgba(0, 0, 0, 0.3);
  max-height: 70vh;

  .settingsMenuItem {
    padding: 10px 16px;
    min-height: 44px;
  }
}
</style>

<style lang="scss">
/* Vue transition classes (must be global) */
.settings-menu-enter-active,
.settings-menu-leave-active {
  transition: opacity 0.18s ease, transform 0.18s ease;
}

.settings-menu-enter-from,
.settings-menu-leave-to {
  opacity: 0;
  transform: translateY(4px) scale(0.97);
}

@media (max-width: 500px) {
  .settings-menu-enter-from,
  .settings-menu-leave-to {
    transform: translateY(8px) scale(0.97);
  }
}
</style>
