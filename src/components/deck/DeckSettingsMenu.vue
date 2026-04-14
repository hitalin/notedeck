<script setup lang="ts">
import { relaunch } from '@tauri-apps/plugin-process'
import type { CSSProperties, Ref } from 'vue'
import {
  computed,
  nextTick,
  reactive,
  ref,
  toRef,
  useTemplateRef,
  watch,
} from 'vue'

import ThemePreview from '@/components/ThemePreview.vue'
import { useMenuKeyboard } from '@/composables/useMenuKeyboard'
import { usePortal } from '@/composables/usePortal'
import { useVaporTransition } from '@/composables/useVaporTransition'
import { type ConfirmOptions, useConfirm } from '@/stores/confirm'
import { useDeckStore } from '@/stores/deck'
import { useKeybindsStore } from '@/stores/keybinds'
import { usePerformanceStore } from '@/stores/performance'
import { useThemeStore } from '@/stores/theme'
import { useIsCompactLayout, useUiStore } from '@/stores/ui'
import { useWindowsStore } from '@/stores/windows'
import { DARK_THEME, LIGHT_THEME } from '@/theme/builtinThemes'
import { hapticSelection } from '@/utils/haptics'
import { commands, unwrap } from '@/utils/tauriInvoke'
import DayNightToggle from './DayNightToggle.vue'

const props = defineProps<{
  show: boolean
  anchor?: HTMLElement | null
}>()

const emit = defineEmits<{
  close: []
  'close-all': []
}>()

const isCompact = useIsCompactLayout()
const { visible: menuVisible, leaving: menuLeaving } = useVaporTransition(
  toRef(props, 'show'),
  { enterDuration: 180, leaveDuration: 180 },
)
const { isMobilePlatform } = useUiStore()
const deckStore = useDeckStore()
const keybindsStore = useKeybindsStore()
const perfStore = usePerformanceStore()
const themeStore = useThemeStore()
const isDark = computed(() => !themeStore.currentSource?.kind.includes('light'))
const isFollowingSystem = computed(() => themeStore.manualMode == null)
const fileInput = ref<HTMLInputElement | null>(null)
const themeGridOpen = ref(false)
const expandedSections = reactive<Record<string, boolean>>({})

function toggleSection(key: string) {
  expandedSections[key] = !expandedSections[key]
}

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

async function removeTheme(id: string) {
  const ok = await confirm({
    title: 'テーマを削除',
    message: 'このテーマを削除しますか？',
    okLabel: '削除',
    type: 'danger',
  })
  if (ok) themeStore.removeTheme(id)
}

const menuEl = ref<HTMLElement | null>(null)
const fixedStyle = ref<CSSProperties | undefined>()

const { activate: activateKeyboard, deactivate: deactivateKeyboard } =
  useMenuKeyboard({
    containerRef: menuEl,
    itemSelector: 'button, [tabindex="0"]',
    onClose: () => emit('close'),
  })

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
      nextTick(activateKeyboard)
    } else {
      deactivateKeyboard()
    }
  },
  { immediate: true },
)

function toggleDarkMode() {
  hapticSelection()
  themeStore.toggleTheme()
}

function toggleSyncDevice(checked: boolean) {
  hapticSelection()
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

const windowsStore = useWindowsStore()

function openToolWindow(
  type:
    | 'cssEditor'
    | 'keybinds'
    | 'themeEditor'
    | 'plugins'
    | 'aiSettings'
    | 'performanceEditor'
    | 'appearanceEditor'
    | 'backup'
    | 'tasksEditor'
    | 'snippetsEditor',
  props: Record<string, unknown> = {},
) {
  windowsStore.open(type, props)
  emit('close')
}

function editTheme(id: string, e: Event) {
  e.stopPropagation()
  openToolWindow('themeEditor', { initialThemeId: id })
}

const { confirm } = useConfirm()

const isExporting = ref(false)
const isImportingDb = ref(false)
const isExportingSettings = ref(false)
const isImportingSettings = ref(false)
const backupError = ref('')

async function backupAction(
  loading: Ref<boolean>,
  action: () => Promise<unknown>,
  opts?: { confirmOpts?: ConfirmOptions; relaunch?: boolean },
) {
  if (opts?.confirmOpts && !(await confirm(opts.confirmOpts))) return
  loading.value = true
  backupError.value = ''
  try {
    const result = await action()
    if (result && opts?.relaunch) {
      await relaunch()
    }
  } catch (e) {
    backupError.value = e instanceof Error ? e.message : String(e)
  } finally {
    loading.value = false
  }
}

const exportDb = () =>
  backupAction(isExporting, () => commands.exportDb().then((r) => unwrap(r)))
const importDb = () =>
  backupAction(
    isImportingDb,
    () => commands.importDb().then((r) => unwrap(r)),
    {
      confirmOpts: {
        title: 'DBインポート',
        message: '現在のDBが上書きされます。',
        okLabel: 'インポート',
        type: 'danger',
      },
      relaunch: true,
    },
  )
const exportSettings = () =>
  backupAction(isExportingSettings, () =>
    commands.exportSettingsJson().then((r) => unwrap(r)),
  )
const importSettings = () =>
  backupAction(
    isImportingSettings,
    () => commands.importSettingsJson().then((r) => unwrap(r)),
    {
      confirmOpts: {
        title: '設定インポート',
        message: '現在の設定が上書きされます。',
        okLabel: 'インポート',
        type: 'danger',
      },
      relaunch: true,
    },
  )

const isClearingCache = ref(false)
const cacheError = ref('')

async function clearAllCache() {
  const ok = await confirm({
    title: 'キャッシュ削除',
    message: 'ノートキャッシュとOGPキャッシュをすべて削除しますか？',
    okLabel: '削除',
    type: 'danger',
  })
  if (!ok) return
  isClearingCache.value = true
  cacheError.value = ''
  try {
    unwrap(await commands.clearAllCache())
  } catch (e) {
    cacheError.value = e instanceof Error ? e.message : String(e)
  } finally {
    isClearingCache.value = false
  }
}

const settingsMenuPortalRef = useTemplateRef<HTMLElement>(
  'settingsMenuPortalRef',
)
usePortal(settingsMenuPortalRef)
</script>

<template>
  <div v-if="show || menuVisible" ref="settingsMenuPortalRef">
  <div v-if="show" :class="$style.menuBackdrop" @pointerdown="emit('close')" />
    <div v-if="menuVisible" ref="menuEl" :class="[$style.settingsMenu, { [$style.mobile]: isCompact }, menuLeaving ? $style.menuLeave : $style.menuEnter]" :style="fixedStyle" class="_popupMenu" @pointerdown.stop>
      <div :class="$style.menuBody">
      <!-- アピアランス -->
      <div :class="$style.categorySection">
        <!-- モバイル: ウィンドウで開く -->
        <button v-if="isCompact" :class="$style.categoryHeader" @click="openToolWindow('appearanceEditor')">
          <i class="ti ti-brush" />
          <span>アピアランス</span>
          <i class="ti ti-chevron-right" :class="$style.chevronNav" />
        </button>
        <!-- デスクトップ: アコーディオン -->
        <template v-else>
        <button :class="$style.categoryHeader" @click="toggleSection('appearance')">
          <i class="ti ti-brush" />
          <span>アピアランス</span>
          <i class="ti ti-chevron-down" :class="[$style.chevron, { [$style.chevronOpen]: expandedSections.appearance }]" />
        </button>
        <div v-if="expandedSections.appearance" :class="$style.categoryBody">
          <DayNightToggle
            :is-dark="isDark"
            :is-following-system="isFollowingSystem"
            @toggle-dark="toggleDarkMode"
            @toggle-sync="(checked: boolean) => toggleSyncDevice(checked)"
          />

          <div :class="$style.themeSelectSection">
            <button :class="$style.themeSelectHeader" @click="themeGridOpen = !themeGridOpen">
              <i :class="isDark ? 'ti ti-moon' : 'ti ti-sun'" />
              <span>{{ isDark ? 'ダークテーマで使うテーマ' : 'ライトテーマで使うテーマ' }}</span>
              <i :class="[$style.chevron, { [$style.chevronOpen]: themeGridOpen }]" class="ti ti-chevron-down" />
            </button>
            <div v-if="themeGridOpen" :class="$style.themeSelectBody">
              <div :class="$style.themeGrid">
                <button :class="[$style.themeItem, { [$style.selected]: selectedId == null }]" @click="selectTheme(null)">
                  <ThemePreview :theme="builtinTheme" :class="$style.themeItemPreview" />
                  <div :class="$style.themeItemName">{{ builtinTheme.name }}</div>
                </button>
                <button
                  v-for="theme in currentModeThemes"
                  :key="theme.id"
                  :class="[$style.themeItem, { [$style.selected]: selectedId === theme.id }]"
                  @click="selectTheme(theme.id)"
                >
                  <div :class="$style.themeItemPreviewWrap">
                    <ThemePreview :theme="theme" :class="$style.themeItemPreview" />
                    <div :class="$style.themeItemActions">
                      <button class="_button" :class="$style.themeEditBtn" title="編集" @click="editTheme(theme.id, $event)">
                        <i class="ti ti-pencil" />
                      </button>
                      <button class="_button" :class="$style.themeRemoveBtn" @click.stop="removeTheme(theme.id)">
                        <i class="ti ti-x" />
                      </button>
                    </div>
                  </div>
                  <div :class="$style.themeItemName">{{ theme.name }}</div>
                </button>
              </div>
            </div>
          </div>

          <button v-if="deckStore.wallpaper == null" :class="$style.settingsMenuItem" @click="pickWallpaper">
            <i class="ti ti-photo" />
            <span :class="$style.settingsMenuLabel">壁紙を設定</span>
          </button>
          <button v-else :class="$style.settingsMenuItem" @click="removeWallpaper">
            <i class="ti ti-photo-off" />
            <span :class="$style.settingsMenuLabel">壁紙を削除</span>
          </button>
        </div>
        </template>
      </div>

      <input
        v-if="!isCompact"
        ref="fileInput"
        type="file"
        accept="image/*"
        style="display: none"
        @change="onFileSelected"
      />

      <!-- 環境設定 (モバイル: フラットに展開) -->
      <template v-if="isCompact">
        <div :class="$style.categorySection">
          <button :class="$style.categoryHeader" @click="openToolWindow('aiSettings')">
            <i class="ti ti-robot" />
            <span>AI</span>
            <i class="ti ti-chevron-right" :class="$style.chevronNav" />
          </button>
        </div>
        <div :class="$style.categorySection">
          <button :class="$style.categoryHeader" @click="openToolWindow('performanceEditor')">
            <i class="ti ti-gauge" />
            <span>パフォーマンス</span>
            <span v-if="Object.keys(perfStore.overrides).length > 0" :class="$style.activeDot" />
            <i class="ti ti-chevron-right" :class="$style.chevronNav" />
          </button>
        </div>
        <div :class="$style.categorySection">
          <button :class="$style.categoryHeader" @click="openToolWindow('cssEditor')">
            <i class="ti ti-code" />
            <span>カスタムCSS</span>
            <span v-if="themeStore.customCss" :class="$style.activeDot" />
            <i class="ti ti-chevron-right" :class="$style.chevronNav" />
          </button>
        </div>
        <div :class="$style.categorySection">
          <button :class="$style.categoryHeader" @click="openToolWindow('tasksEditor')">
            <i class="ti ti-player-play" />
            <span>タスク</span>
            <i class="ti ti-chevron-right" :class="$style.chevronNav" />
          </button>
        </div>
        <div :class="$style.categorySection">
          <button :class="$style.categoryHeader" @click="openToolWindow('snippetsEditor')">
            <i class="ti ti-code-plus" />
            <span>スニペット</span>
            <i class="ti ti-chevron-right" :class="$style.chevronNav" />
          </button>
        </div>
      </template>
      <!-- 環境設定 (デスクトップ: アコーディオン) -->
      <div v-else :class="$style.categorySection">
        <button :class="$style.categoryHeader" @click="toggleSection('settings')">
          <i class="ti ti-settings" />
          <span>環境設定</span>
          <i class="ti ti-chevron-down" :class="[$style.chevron, { [$style.chevronOpen]: expandedSections.settings }]" />
        </button>
        <div v-if="expandedSections.settings" :class="$style.categoryBody">
          <button :class="$style.settingsMenuItem" @click="openToolWindow('aiSettings')">
            <i class="ti ti-robot" />
            <span :class="$style.settingsMenuLabel">AI</span>
          </button>
          <button v-if="!isMobilePlatform" :class="$style.settingsMenuItem" @click="openToolWindow('keybinds')">
            <i class="ti ti-keyboard" />
            <span :class="$style.settingsMenuLabel">キーバインド</span>
            <span v-if="Object.keys(keybindsStore.overrides).length > 0" :class="$style.activeDot" />
          </button>
          <button :class="$style.settingsMenuItem" @click="openToolWindow('performanceEditor')">
            <i class="ti ti-gauge" />
            <span :class="$style.settingsMenuLabel">パフォーマンス</span>
            <span v-if="Object.keys(perfStore.overrides).length > 0" :class="$style.activeDot" />
          </button>
          <button :class="$style.settingsMenuItem" @click="openToolWindow('cssEditor')">
            <i class="ti ti-code" />
            <span :class="$style.settingsMenuLabel">カスタムCSS</span>
            <span v-if="themeStore.customCss" :class="$style.activeDot" />
          </button>
          <button :class="$style.settingsMenuItem" @click="openToolWindow('tasksEditor')">
            <i class="ti ti-player-play" />
            <span :class="$style.settingsMenuLabel">タスク</span>
          </button>
          <button :class="$style.settingsMenuItem" @click="openToolWindow('snippetsEditor')">
            <i class="ti ti-code-plus" />
            <span :class="$style.settingsMenuLabel">スニペット</span>
          </button>
        </div>
      </div>

      <!-- データ (モバイル: バックアップとキャッシュを分割) -->
      <template v-if="isCompact">
        <div :class="$style.categorySection">
          <button :class="$style.categoryHeader" @click="openToolWindow('backup')">
            <i class="ti ti-database" />
            <span>バックアップ</span>
            <i class="ti ti-chevron-right" :class="$style.chevronNav" />
          </button>
        </div>
        <div :class="$style.categorySection">
          <button :class="$style.categoryHeader" :disabled="isClearingCache" @click="clearAllCache">
            <i class="ti ti-eraser" />
            <span>{{ isClearingCache ? 'キャッシュ削除中...' : 'キャッシュ削除' }}</span>
          </button>
          <div v-if="cacheError" :class="$style.backupError">{{ cacheError }}</div>
        </div>
      </template>
      <!-- データ (デスクトップ: 従来のアコーディオン) -->
      <div v-else :class="$style.categorySection">
        <button :class="$style.categoryHeader" @click="toggleSection('data')">
          <i class="ti ti-database" />
          <span>データ</span>
          <i class="ti ti-chevron-down" :class="[$style.chevron, { [$style.chevronOpen]: expandedSections.data }]" />
        </button>
        <div v-if="expandedSections.data" :class="$style.categoryBody">
          <div :class="$style.dataGroup">
            <span :class="$style.dataGroupLabel"><i class="ti ti-eraser" /> キャッシュ</span>
            <div :class="$style.dataBtnRow">
              <button class="_button" :class="$style.dataBtn" :disabled="isClearingCache" @click="clearAllCache">
                <i class="ti ti-trash" />
                {{ isClearingCache ? '処理中...' : '全キャッシュ削除' }}
              </button>
            </div>
            <div v-if="cacheError" :class="$style.backupError">{{ cacheError }}</div>
          </div>
          <div :class="$style.dataGroup">
            <span :class="$style.dataGroupLabel"><i class="ti ti-database-export" /> DBバックアップ</span>
            <div :class="$style.dataBtnRow">
              <button class="_button" :class="$style.dataBtn" :disabled="isImportingDb" @click="importDb">
                <i class="ti ti-clipboard-text" />
                {{ isImportingDb ? '処理中...' : 'インポート' }}
              </button>
              <button class="_button" :class="$style.dataBtn" :disabled="isExporting" @click="exportDb">
                <i class="ti ti-clipboard-copy" />
                {{ isExporting ? '処理中...' : 'エクスポート' }}
              </button>
            </div>
          </div>
          <div :class="$style.dataGroup">
            <span :class="$style.dataGroupLabel"><i class="ti ti-settings" /> 設定バックアップ</span>
            <div :class="$style.dataBtnRow">
              <button class="_button" :class="$style.dataBtn" :disabled="isImportingSettings" @click="importSettings">
                <i class="ti ti-clipboard-text" />
                {{ isImportingSettings ? '処理中...' : 'インポート' }}
              </button>
              <button class="_button" :class="$style.dataBtn" :disabled="isExportingSettings" @click="exportSettings">
                <i class="ti ti-clipboard-copy" />
                {{ isExportingSettings ? '処理中...' : 'エクスポート' }}
              </button>
            </div>
          </div>
          <div v-if="backupError" :class="$style.backupError">{{ backupError }}</div>
        </div>
      </div>

      </div>
    </div>
  </div>
</template>

<style lang="scss" module>
@use '@/styles/navMenu';

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
  width: 260px;
  max-height: 80vh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.menuBody {
  flex: 1;
  overflow-x: hidden;
  overflow-y: auto;
  min-height: 0;
}

/* -- Category accordion -- */

.categorySection {
  border-bottom: 1px solid var(--nd-divider);
}

.categoryHeader {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 4px 12px;
  font-size: 0.85em;
  font-weight: bold;
  color: var(--nd-fg);
  opacity: 0.7;
  border: none;
  background: none;
  cursor: pointer;
  transition: opacity var(--nd-duration-fast), background var(--nd-duration-fast);

  &:hover {
    opacity: 1;
    background: var(--nd-accent-hover);
  }
}

.categoryBody {
  padding-bottom: 4px;
}

/* -- Theme selection grid -- */

.themeSelectSection {
  padding: 8px 12px;
  min-width: 0;
  overflow: hidden;
}

.themeSelectHeader {
  display: flex;
  align-items: center;
  gap: 6px;
  width: 100%;
  font-size: 0.8em;
  color: var(--nd-fg);
  opacity: 0.7;
  padding: 0 4px;
  border: none;
  background: none;
  cursor: pointer;
  transition: opacity var(--nd-duration-fast);

  &:hover {
    opacity: 1;
  }
}

.chevron {
  margin-left: auto;
  font-size: 0.9em;
  transition: transform var(--nd-duration-base);
  transform: rotate(-90deg);
}

.chevronOpen {
  transform: rotate(0deg);
}

.chevronNav {
  margin-left: auto;
  font-size: 0.9em;
  opacity: 0.5;
}

.themeSelectBody {
  margin-top: 8px;
  max-height: 200px;
  overflow-y: auto;
}

.themeGrid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 6px;
}

.themeItem {
  cursor: pointer;
  padding: 0;
  background: none;
  font: inherit;
  color: inherit;
  text-align: left;
  border: 2px solid var(--nd-divider);
  border-radius: var(--nd-radius-sm);
  overflow: hidden;
  min-width: 0;
  transition: border-color var(--nd-duration-base);

  &:hover {
    border-color: color-mix(in srgb, var(--nd-accent) 50%, var(--nd-divider));
  }
}

.selected {
  border-color: var(--nd-accent);
}

.themeItemPreviewWrap {
  position: relative;
}

.themeItemPreview {
  display: block;
  width: calc(100% + 2px);
  margin-left: -1px;
  height: auto;
  border-bottom: 1px solid var(--nd-divider);
}

.themeItemActions {
  position: absolute;
  top: 2px;
  right: 2px;
  display: flex;
  gap: 2px;
  z-index: 1;
  opacity: 0;
  transition: opacity var(--nd-duration-fast);

  .themeItem:hover & {
    opacity: 1;
  }
}

.themeEditBtn,
.themeRemoveBtn {
  width: 18px;
  height: 18px;
  border-radius: 50%;
  color: #fff;
  font-size: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: filter var(--nd-duration-base);

  &:hover {
    filter: brightness(0.85);
  }
}

.themeEditBtn {
  background: var(--nd-accent, #86b300);
}

.themeRemoveBtn {
  background: var(--nd-error, #ec4137);
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

/* -- Custom CSS -- */

.activeDot {
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
  width: 100%;
  padding: 4px 12px;
  border: none;
  background: none;
  cursor: pointer;
  font: inherit;
  font-size: 0.85em;
  line-height: 20px;
  color: var(--nd-fg);
  text-align: left;
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
  margin: 4px 0;
}

.dataGroup {
  padding: 4px 16px;
}

.dataGroupLabel {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 0.8em;
  color: var(--nd-fg);
  margin-bottom: 4px;
}

.dataBtnRow {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 4px;
}

.backupError {
  padding: 2px 16px;
  font-size: 0.75em;
  color: var(--nd-error, #ec4137);
}

.dataBtn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  padding: 6px 10px;
  border-radius: var(--nd-radius-sm);
  background: var(--nd-buttonBg);
  font-size: 0.75em;
  font-weight: bold;
  color: var(--nd-fg);
  transition: background var(--nd-duration-base), color var(--nd-duration-base);
  white-space: nowrap;

  &:hover:not(:disabled) {
    background: var(--nd-buttonHoverBg);
  }

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
}

.settingsMenuLabel {
  position: relative;
}

.mobile {
  width: 234px;
  max-width: calc(100vw - 16px);
  min-width: 0;
  border-radius: 12px;
  background: color-mix(in srgb, var(--nd-navBg) 80%, transparent);
  backdrop-filter: var(--nd-vibrancy);
  -webkit-backdrop-filter: var(--nd-vibrancy);
  box-shadow: 0 -4px 24px rgba(0, 0, 0, 0.3);
  max-height: 70vh;

  .themeGrid {
    grid-template-columns: 1fr;
  }

  .settingsMenuItem {
    padding: 8px 12px;
    min-height: 44px;
  }

  .categoryHeader {
    padding: 8px 12px;
    min-height: 44px;
  }
}

</style>
