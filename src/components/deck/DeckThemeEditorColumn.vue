<script setup lang="ts">
import JSON5 from 'json5'
import { computed, onMounted, onUnmounted, ref, useCssModule, watch } from 'vue'
import { useColumnTheme } from '@/composables/useColumnTheme'
import type { DeckColumn as DeckColumnType } from '@/stores/deck'
import { useThemeStore } from '@/stores/theme'
import { DARK_THEME, LIGHT_THEME } from '@/theme/builtinThemes'
import { parseColor, toRgba } from '@/theme/colorUtils'
import { compileMisskeyTheme } from '@/theme/compiler'
import type { MisskeyTheme } from '@/theme/types'
import DeckColumn from './DeckColumn.vue'

const props = defineProps<{
  column: DeckColumnType
}>()

const { columnThemeVars } = useColumnTheme(() => props.column)
const themeStore = useThemeStore()

const tab = ref<'visual' | 'code'>('visual')
const themeName = ref('My Theme')
const baseMode = ref<'dark' | 'light'>('dark')

// Primary color props that users typically want to edit directly
const PRIMARY_PROPS: { key: string; label: string }[] = [
  { key: 'accent', label: 'アクセント' },
  { key: 'bg', label: '背景' },
  { key: 'fg', label: '文字色' },
  { key: 'panel', label: 'パネル' },
  { key: 'navBg', label: 'ナビバー背景' },
  { key: 'love', label: 'いいね' },
  { key: 'link', label: 'リンク' },
  { key: 'hashtag', label: 'ハッシュタグ' },
  { key: 'mention', label: 'メンション' },
  { key: 'renote', label: 'リノート' },
  { key: 'divider', label: '区切り線' },
  { key: 'success', label: '成功' },
  { key: 'error', label: 'エラー' },
  { key: 'warn', label: '警告' },
]

// Working props: only user overrides (not base theme defaults)
const overrides = ref<Record<string, string>>({})

const baseTheme = computed(() =>
  baseMode.value === 'dark' ? DARK_THEME : LIGHT_THEME,
)

// Compiled preview of current theme
const previewTheme = computed<MisskeyTheme>(() => ({
  id: `editor-${Date.now()}`,
  name: themeName.value,
  base: baseMode.value,
  props: { ...overrides.value },
}))

// Resolved color values for color picker display
const resolvedColors = computed(() => {
  const compiled = compileMisskeyTheme(previewTheme.value, baseTheme.value)
  return compiled
})

// All props (base + overrides) for code view
const allResolvedProps = computed(() => {
  const base = { ...baseTheme.value.props }
  return { ...base, ...overrides.value }
})

// Code editor content
const codeContent = ref('')
const codeError = ref<string | null>(null)

function syncCodeFromVisual() {
  const theme: MisskeyTheme = {
    id: `custom-${Date.now()}`,
    name: themeName.value,
    base: baseMode.value,
    props: { ...baseTheme.value.props, ...overrides.value },
  }
  codeContent.value = JSON.stringify(theme, null, 2)
  codeError.value = null
}

function syncVisualFromCode() {
  try {
    const parsed = JSON5.parse(codeContent.value)
    if (!parsed || typeof parsed !== 'object' || !parsed.props) {
      codeError.value = 'テーマオブジェクトに props がありません'
      return
    }
    themeName.value = parsed.name || 'Untitled'
    baseMode.value = parsed.base === 'light' ? 'light' : 'dark'
    overrides.value = { ...parsed.props }
    codeError.value = null
  } catch (e) {
    codeError.value = e instanceof Error ? e.message : 'JSONパースエラー'
  }
}

// Sync code when switching to code tab
watch(tab, (newTab) => {
  if (newTab === 'code') syncCodeFromVisual()
})

// Convert resolved color to hex for input[type=color]
function toHex(value: string): string {
  const rgba = parseColor(value)
  if (!rgba) return '#000000'
  const r = Math.round(rgba[0]).toString(16).padStart(2, '0')
  const g = Math.round(rgba[1]).toString(16).padStart(2, '0')
  const b = Math.round(rgba[2]).toString(16).padStart(2, '0')
  return `#${r}${g}${b}`
}

function updateColor(key: string, hex: string) {
  overrides.value = { ...overrides.value, [key]: hex }
}

function resetProp(key: string) {
  const next = { ...overrides.value }
  delete next[key]
  overrides.value = next
}

function isOverridden(key: string): boolean {
  return key in overrides.value
}

// Get display value: override expression or base default
function displayValue(key: string): string {
  if (key in overrides.value) return overrides.value[key]
  return baseTheme.value.props[key] ?? ''
}

// Is this prop a reference/expression (starts with @ or :)?
function isExpression(value: string): boolean {
  const v = value.trim()
  return v.startsWith('@') || v.startsWith(':') || v.startsWith('"')
}

// Apply theme to app in real-time
function applyPreview() {
  themeStore.applySource({
    kind: baseMode.value === 'dark' ? 'custom-dark' : 'custom-light',
    theme: previewTheme.value,
  })
}

// Watch overrides for live preview
let previewTimer: ReturnType<typeof setTimeout> | null = null
watch(
  [overrides, baseMode],
  () => {
    if (previewTimer) clearTimeout(previewTimer)
    previewTimer = setTimeout(applyPreview, 150)
  },
  { deep: true },
)

// Install as a permanent theme
function installTheme() {
  const theme: MisskeyTheme = {
    id: `custom-${Date.now()}`,
    name: themeName.value,
    base: baseMode.value,
    props: { ...baseTheme.value.props, ...overrides.value },
  }
  themeStore.installTheme(JSON.stringify(theme))
  themeStore.selectTheme(theme.id, baseMode.value)
}

// Export as JSON
function exportTheme() {
  const theme: MisskeyTheme = {
    id: `custom-${Date.now()}`,
    name: themeName.value,
    base: baseMode.value,
    props: { ...baseTheme.value.props, ...overrides.value },
  }
  const json = JSON.stringify(theme, null, 2)
  navigator.clipboard.writeText(json)
  copiedMessage.value = true
  setTimeout(() => {
    copiedMessage.value = false
  }, 2000)
}

const copiedMessage = ref(false)

// Load existing theme for editing
function loadFromInstalled(theme: MisskeyTheme) {
  themeName.value = theme.name
  baseMode.value = theme.base ?? 'dark'
  overrides.value = { ...theme.props }
}

// All non-primary props that have overrides
const secondaryOverrides = computed(() => {
  const primaryKeys = new Set(PRIMARY_PROPS.map((p) => p.key))
  return Object.keys(overrides.value)
    .filter((k) => !primaryKeys.has(k))
    .sort()
})

// All base theme props not in primary or already overridden
const availableSecondaryProps = computed(() => {
  const primaryKeys = new Set(PRIMARY_PROPS.map((p) => p.key))
  const overriddenKeys = new Set(Object.keys(overrides.value))
  return Object.keys(baseTheme.value.props)
    .filter((k) => !primaryKeys.has(k) && !overriddenKeys.has(k))
    .sort()
})

// Custom dropdown states
const showLoadDropdown = ref(false)
const showAddPropDropdown = ref(false)

function selectInstalledTheme(theme: MisskeyTheme) {
  loadFromInstalled(theme)
  showLoadDropdown.value = false
}

function selectAddProp(key: string) {
  const baseVal = baseTheme.value.props[key] ?? ''
  overrides.value = { ...overrides.value, [key]: baseVal }
  showAddPropDropdown.value = false
}

// Resolve accent color from a theme for preview swatch
function themeAccentColor(theme: MisskeyTheme): string {
  const base = theme.base === 'light' ? LIGHT_THEME : DARK_THEME
  const compiled = compileMisskeyTheme(theme, base)
  return compiled.accent ?? '#888'
}

// Close dropdowns on outside click
function handleOutsideClick(e: MouseEvent) {
  const target = e.target as HTMLElement
  if (!target.closest(`.${useCssModule().dropdown}`)) {
    showLoadDropdown.value = false
    showAddPropDropdown.value = false
  }
}

onMounted(() => document.addEventListener('click', handleOutsideClick))
onUnmounted(() => document.removeEventListener('click', handleOutsideClick))
</script>

<template>
  <DeckColumn
    :column-id="column.id"
    :title="column.name ?? 'テーマエディタ'"
    :theme-vars="columnThemeVars"
  >
    <template #header-icon>
      <i class="ti ti-palette" :class="$style.tlHeaderIcon" />
    </template>

    <div :class="$style.editor">
      <!-- Theme name & base -->
      <div :class="$style.metaSection">
        <input
          v-model="themeName"
          :class="$style.nameInput"
          type="text"
          placeholder="テーマ名"
          spellcheck="false"
        />
        <div :class="$style.baseToggle">
          <button
            class="_button"
            :class="[$style.baseBtn, { [$style.active]: baseMode === 'dark' }]"
            @click="baseMode = 'dark'"
          >
            <i class="ti ti-moon" />
            Dark
          </button>
          <button
            class="_button"
            :class="[$style.baseBtn, { [$style.active]: baseMode === 'light' }]"
            @click="baseMode = 'light'"
          >
            <i class="ti ti-sun" />
            Light
          </button>
        </div>
      </div>

      <!-- Tabs -->
      <div :class="$style.tabs">
        <button
          class="_button"
          :class="[$style.tab, { [$style.active]: tab === 'visual' }]"
          @click="tab = 'visual'"
        >
          <i class="ti ti-palette" />
          ビジュアル
        </button>
        <button
          class="_button"
          :class="[$style.tab, { [$style.active]: tab === 'code' }]"
          @click="tab = 'code'"
        >
          <i class="ti ti-code" />
          コード
        </button>
      </div>

      <!-- Visual Editor -->
      <div v-show="tab === 'visual'" :class="$style.visualPanel">
        <!-- Load from existing -->
        <div v-if="themeStore.installedThemes.length" :class="$style.loadSection">
          <div :class="$style.dropdown">
            <button
              class="_button"
              :class="$style.dropdownTrigger"
              @click="showLoadDropdown = !showLoadDropdown"
            >
              <i class="ti ti-palette" />
              <span>既存テーマを読み込み...</span>
              <i class="ti ti-chevron-down" :class="$style.dropdownChevron" />
            </button>
            <div v-if="showLoadDropdown" :class="$style.dropdownPanel">
              <button
                v-for="t in themeStore.installedThemes"
                :key="t.id"
                class="_button"
                :class="$style.dropdownItem"
                @click="selectInstalledTheme(t)"
              >
                <div
                  :class="$style.themeSwatch"
                  :style="{ background: themeAccentColor(t) }"
                />
                <span :class="$style.dropdownItemLabel">{{ t.name }}</span>
                <span :class="$style.dropdownItemBadge">{{ t.base }}</span>
              </button>
            </div>
          </div>
        </div>

        <!-- Primary Colors -->
        <div :class="$style.categoryLabel">基本色</div>
        <div :class="$style.propList">
          <div
            v-for="prop in PRIMARY_PROPS"
            :key="prop.key"
            :class="$style.propRow"
          >
            <div :class="$style.propLabel">
              <span>{{ prop.label }}</span>
              <span :class="$style.propKey">{{ prop.key }}</span>
            </div>
            <div :class="$style.propControls">
              <div :class="$style.colorPickerWrap">
                <input
                  type="color"
                  :class="$style.colorPicker"
                  :value="toHex(resolvedColors[prop.key] ?? '')"
                  @input="(e) => updateColor(prop.key, (e.target as HTMLInputElement).value)"
                />
                <div
                  :class="$style.colorSwatch"
                  :style="{ background: resolvedColors[prop.key] ?? 'transparent' }"
                />
              </div>
              <input
                :class="[$style.propValueInput, { [$style.expression]: isExpression(displayValue(prop.key)) }]"
                type="text"
                :value="displayValue(prop.key)"
                :placeholder="baseTheme.props[prop.key] ?? ''"
                spellcheck="false"
                @change="(e) => updateColor(prop.key, (e.target as HTMLInputElement).value)"
              />
              <button
                v-if="isOverridden(prop.key)"
                class="_button"
                :class="$style.resetBtn"
                title="デフォルトに戻す"
                @click="resetProp(prop.key)"
              >
                <i class="ti ti-x" />
              </button>
            </div>
          </div>
        </div>

        <!-- Secondary overrides -->
        <div v-if="secondaryOverrides.length" :class="$style.categoryLabel">追加プロパティ</div>
        <div v-if="secondaryOverrides.length" :class="$style.propList">
          <div
            v-for="key in secondaryOverrides"
            :key="key"
            :class="$style.propRow"
          >
            <div :class="$style.propLabel">
              <span :class="$style.propKey">{{ key }}</span>
            </div>
            <div :class="$style.propControls">
              <div :class="$style.colorPickerWrap">
                <input
                  type="color"
                  :class="$style.colorPicker"
                  :value="toHex(resolvedColors[key] ?? '')"
                  @input="(e) => updateColor(key, (e.target as HTMLInputElement).value)"
                />
                <div
                  :class="$style.colorSwatch"
                  :style="{ background: resolvedColors[key] ?? 'transparent' }"
                />
              </div>
              <input
                :class="[$style.propValueInput, { [$style.expression]: isExpression(displayValue(key)) }]"
                type="text"
                :value="displayValue(key)"
                spellcheck="false"
                @change="(e) => updateColor(key, (e.target as HTMLInputElement).value)"
              />
              <button
                class="_button"
                :class="$style.resetBtn"
                title="削除"
                @click="resetProp(key)"
              >
                <i class="ti ti-x" />
              </button>
            </div>
          </div>
        </div>

        <!-- Add more props -->
        <div :class="$style.addPropSection">
          <div :class="$style.dropdown">
            <button
              class="_button"
              :class="$style.dropdownTrigger"
              @click="showAddPropDropdown = !showAddPropDropdown"
            >
              <i class="ti ti-plus" />
              <span>プロパティを追加...</span>
              <i class="ti ti-chevron-down" :class="$style.dropdownChevron" />
            </button>
            <div v-if="showAddPropDropdown" :class="$style.dropdownPanel">
              <button
                v-for="key in availableSecondaryProps"
                :key="key"
                class="_button"
                :class="$style.dropdownItem"
                @click="selectAddProp(key)"
              >
                <div
                  :class="$style.themeSwatch"
                  :style="{ background: resolvedColors[key] ?? 'transparent' }"
                />
                <span :class="$style.dropdownItemLabel">{{ key }}</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      <!-- Code Editor -->
      <div v-show="tab === 'code'" :class="$style.codePanel">
        <textarea
          v-model="codeContent"
          :class="$style.codeTextarea"
          spellcheck="false"
          rows="20"
        />
        <div v-if="codeError" :class="$style.codeError">{{ codeError }}</div>
        <button
          class="_button"
          :class="$style.codeApplyBtn"
          @click="syncVisualFromCode"
        >
          <i class="ti ti-check" />
          コードから反映
        </button>
      </div>

      <!-- Actions -->
      <div :class="$style.actions">
        <button
          class="_button"
          :class="$style.actionBtn"
          @click="installTheme"
        >
          <i class="ti ti-download" />
          インストール
        </button>
        <button
          class="_button"
          :class="[$style.actionBtn, $style.secondary]"
          @click="exportTheme"
        >
          <i class="ti ti-clipboard" />
          {{ copiedMessage ? 'コピーしました!' : 'JSONコピー' }}
        </button>
      </div>
    </div>
  </DeckColumn>
</template>

<style lang="scss" module>
.tlHeaderIcon {
  flex-shrink: 0;
  opacity: 0.7;
}

.editor {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
  overflow: hidden;
}

.metaSection {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 10px;
  border-bottom: 1px solid var(--nd-divider);
  flex-shrink: 0;
}

.nameInput {
  padding: 6px 10px;
  border: 1px solid var(--nd-divider);
  border-radius: var(--nd-radius-sm);
  background: var(--nd-bg);
  color: var(--nd-fg);
  font-size: 0.9em;
  font-weight: bold;
  outline: none;
  transition: border-color var(--nd-duration-base);

  &:focus {
    border-color: var(--nd-accent);
  }
}

.baseToggle {
  display: flex;
  gap: 4px;
}

.baseBtn {
  display: flex;
  align-items: center;
  gap: 4px;
  flex: 1;
  padding: 6px 10px;
  border-radius: var(--nd-radius-sm);
  font-size: 0.8em;
  font-weight: bold;
  color: var(--nd-fg);
  opacity: 0.5;
  background: var(--nd-buttonBg);
  transition: opacity var(--nd-duration-base), background var(--nd-duration-base);
  justify-content: center;

  &:hover {
    opacity: 0.7;
  }

  &.active {
    opacity: 1;
    background: var(--nd-accentedBg);
    color: var(--nd-accent);
  }
}

.tabs {
  display: flex;
  gap: 0;
  border-bottom: 1px solid var(--nd-divider);
  flex-shrink: 0;
}

.tab {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 6px 12px;
  font-size: 0.75em;
  font-weight: bold;
  color: var(--nd-fg);
  opacity: 0.5;
  border-bottom: 2px solid transparent;
  transition: opacity var(--nd-duration-base), border-color var(--nd-duration-base);

  &:hover {
    opacity: 0.8;
  }

  &.active {
    opacity: 1;
    border-bottom-color: var(--nd-accent);
    color: var(--nd-accent);
  }
}

.active {
  /* modifier */
}

.expression {
  /* modifier */
}

.secondary {
  /* modifier */
}

.visualPanel {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
  overflow-y: auto;
}

.loadSection {
  padding: 8px 10px;
  border-bottom: 1px solid var(--nd-divider);
}

.dropdown {
  position: relative;
  width: 100%;
}

.dropdownTrigger {
  display: flex;
  align-items: center;
  gap: 6px;
  width: 100%;
  padding: 6px 10px;
  border: 1px solid var(--nd-divider);
  border-radius: var(--nd-radius-sm);
  background: var(--nd-bg);
  color: var(--nd-fg);
  font-size: 0.8em;
  text-align: left;
  transition: border-color var(--nd-duration-base), background var(--nd-duration-base);

  &:hover {
    background: var(--nd-buttonHoverBg);
  }
}

.dropdownChevron {
  margin-left: auto;
  opacity: 0.4;
  font-size: 0.85em;
}

.dropdownPanel {
  position: absolute;
  top: 100%;
  left: 0;
  right: 0;
  z-index: 100;
  max-height: 200px;
  overflow-y: auto;
  margin-top: 2px;
  border: 1px solid var(--nd-divider);
  border-radius: var(--nd-radius-sm);
  background: var(--nd-panel);
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.25);
}

.dropdownItem {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 7px 10px;
  font-size: 0.8em;
  color: var(--nd-fg);
  text-align: left;
  transition: background var(--nd-duration-base);

  &:hover {
    background: var(--nd-buttonHoverBg);
  }

  & + & {
    border-top: 1px solid color-mix(in srgb, var(--nd-divider) 50%, transparent);
  }
}

.dropdownItemLabel {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.dropdownItemBadge {
  font-size: 0.85em;
  opacity: 0.5;
  flex-shrink: 0;
}

.themeSwatch {
  width: 16px;
  height: 16px;
  border-radius: 3px;
  border: 1px solid var(--nd-divider);
  flex-shrink: 0;
}

.categoryLabel {
  padding: 8px 10px 4px;
  font-size: 0.7em;
  font-weight: bold;
  opacity: 0.5;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.propList {
  display: flex;
  flex-direction: column;
}

.propRow {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 6px 10px;
  border-bottom: 1px solid color-mix(in srgb, var(--nd-divider) 50%, transparent);

  &:hover {
    background: var(--nd-buttonHoverBg);
  }
}

.propLabel {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 0.8em;
}

.propKey {
  font-family: 'Fira Code', 'Cascadia Code', 'Consolas', monospace;
  font-size: 0.85em;
  opacity: 0.5;
}

.propControls {
  display: flex;
  align-items: center;
  gap: 4px;
}

.colorPickerWrap {
  position: relative;
  width: 24px;
  height: 24px;
  flex-shrink: 0;
}

.colorPicker {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  opacity: 0;
  cursor: pointer;
}

.colorSwatch {
  width: 24px;
  height: 24px;
  border-radius: 4px;
  border: 1px solid var(--nd-divider);
  pointer-events: none;
}

.propValueInput {
  flex: 1;
  min-width: 0;
  padding: 3px 6px;
  border: 1px solid var(--nd-divider);
  border-radius: var(--nd-radius-sm);
  background: var(--nd-bg);
  color: var(--nd-fg);
  font-family: 'Fira Code', 'Cascadia Code', 'Consolas', monospace;
  font-size: 0.75em;
  outline: none;
  transition: border-color var(--nd-duration-base);

  &:focus {
    border-color: var(--nd-accent);
  }

  &.expression {
    color: var(--nd-accent);
  }
}

.resetBtn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  border-radius: var(--nd-radius-sm);
  color: var(--nd-fg);
  opacity: 0.4;
  flex-shrink: 0;
  transition: opacity var(--nd-duration-base), color var(--nd-duration-base);

  &:hover {
    opacity: 1;
    color: var(--nd-love);
  }
}

.addPropSection {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 8px 10px;
}

.codePanel {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 10px;
  flex: 1;
  min-height: 0;
  overflow-y: auto;
}

.codeTextarea {
  flex: 1;
  min-height: 200px;
  padding: 8px 10px;
  border: 1px solid var(--nd-divider);
  border-radius: var(--nd-radius-sm);
  background: var(--nd-bg);
  color: var(--nd-fg);
  font-family: 'Fira Code', 'Cascadia Code', 'Consolas', monospace;
  font-size: 0.75em;
  line-height: 1.5;
  resize: vertical;
  outline: none;
  transition: border-color var(--nd-duration-base);

  &:focus {
    border-color: var(--nd-accent);
  }
}

.codeError {
  padding: 6px 8px;
  border-radius: var(--nd-radius-sm);
  background: var(--nd-love-subtle);
  color: var(--nd-love);
  font-size: 0.8em;
}

.codeApplyBtn {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 6px 12px;
  border-radius: var(--nd-radius-sm);
  background: var(--nd-buttonBg);
  color: var(--nd-fg);
  font-size: 0.8em;
  font-weight: bold;
  transition: background var(--nd-duration-base);

  &:hover {
    background: var(--nd-buttonHoverBg);
  }
}

.actions {
  display: flex;
  gap: 6px;
  padding: 10px;
  border-top: 1px solid var(--nd-divider);
  flex-shrink: 0;
}

.actionBtn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  flex: 1;
  padding: 8px 12px;
  border-radius: var(--nd-radius-sm);
  background: var(--nd-accent);
  color: var(--nd-fgOnAccent);
  font-size: 0.8em;
  font-weight: bold;
  transition: background var(--nd-duration-base);

  &:hover {
    background: var(--nd-accentDarken);
  }

  &.secondary {
    background: var(--nd-buttonBg);
    color: var(--nd-fg);

    &:hover {
      background: var(--nd-buttonHoverBg);
    }
  }
}
</style>
