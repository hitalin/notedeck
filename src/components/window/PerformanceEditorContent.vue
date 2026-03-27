<script setup lang="ts">
import { json } from '@codemirror/lang-json'
import { computed, ref, watch } from 'vue'
import EditorTabs from '@/components/common/EditorTabs.vue'
import CodeEditor from '@/components/deck/widgets/CodeEditor.vue'
import { useClipboardFeedback } from '@/composables/useClipboardFeedback'
import { useDoubleConfirm } from '@/composables/useDoubleConfirm'
import { useEditorTabs } from '@/composables/useEditorTabs'
import {
  CATEGORY_LABELS,
  FIELD_META,
  type PerformanceKey,
  PRESETS,
  type PresetKey,
  usePerformanceStore,
} from '@/stores/performance'

const jsonLang = json()

const perfStore = usePerformanceStore()

const { tab, containerRef: editorRef } = useEditorTabs(
  ['visual', 'code'] as const,
  'visual',
)

// --- Visual tab state ---

const categories = computed(() => {
  const cats = new Map<
    string,
    { key: PerformanceKey; meta: (typeof FIELD_META)[PerformanceKey] }[]
  >()
  for (const [key, meta] of Object.entries(FIELD_META)) {
    const cat = meta.category
    if (!cats.has(cat)) cats.set(cat, [])
    cats.get(cat)?.push({ key: key as PerformanceKey, meta })
  }
  return cats
})

const expandedSections = ref(new Set<string>())

function toggleSection(catKey: string) {
  if (expandedSections.value.has(catKey)) {
    expandedSections.value.delete(catKey)
  } else {
    expandedSections.value.add(catKey)
  }
}

function handleSlider(key: PerformanceKey, event: Event) {
  const target = event.target as HTMLInputElement
  perfStore.set(key, Number(target.value))
}

function handleNumberInput(key: PerformanceKey, event: Event) {
  const target = event.target as HTMLInputElement
  const val = Number(target.value)
  if (!Number.isNaN(val)) {
    perfStore.set(key, val)
  }
}

function selectPreset(key: PresetKey) {
  perfStore.applyPreset(key)
}

// --- Code tab ---

const code = ref('')
const codeError = ref('')

function syncCodeFromVisual() {
  code.value = JSON.stringify(perfStore.overrides, null, 2)
  codeError.value = ''
}

function syncVisualFromCode() {
  try {
    const parsed = JSON.parse(code.value || '{}')
    // Validate: only allow known keys
    for (const key of Object.keys(parsed)) {
      if (!(key in FIELD_META)) {
        codeError.value = `不明なキー: ${key}`
        return
      }
    }
    perfStore.overrides = parsed
    perfStore.resetAll() // clear, then re-apply
    for (const [k, v] of Object.entries(parsed)) {
      perfStore.set(k as PerformanceKey, v as number)
    }
    codeError.value = ''
  } catch (e) {
    codeError.value = e instanceof Error ? e.message : 'JSON解析エラー'
  }
}

watch(tab, (newTab) => {
  if (newTab === 'code') syncCodeFromVisual()
})

let codeApplyTimer: ReturnType<typeof setTimeout> | null = null
watch(code, () => {
  if (tab.value !== 'code') return
  if (codeApplyTimer) clearTimeout(codeApplyTimer)
  codeApplyTimer = setTimeout(syncVisualFromCode, 400)
})

// --- Actions ---

const {
  copied: copiedMessage,
  importFeedback: importedMessage,
  importError,
  copyToClipboard,
  readFromClipboard,
} = useClipboardFeedback()

async function exportConfig() {
  await copyToClipboard(JSON.stringify(perfStore.overrides, null, 2))
}

async function importConfig() {
  const text = await readFromClipboard()
  if (!text) return
  try {
    const parsed = JSON.parse(text)
    for (const [k, v] of Object.entries(parsed)) {
      if (k in FIELD_META) {
        perfStore.set(k as PerformanceKey, v as number)
      }
    }
  } catch {
    // importError is set by readFromClipboard on failure
  }
}

const { confirming: confirmingReset, trigger: triggerReset } =
  useDoubleConfirm()
function handleReset() {
  triggerReset(() => {
    perfStore.resetAll()
  })
}
</script>

<template>
  <div ref="editorRef" :class="$style.content">
    <EditorTabs
      v-model="tab"
      :tabs="[
        { value: 'visual', icon: 'adjustments', label: 'ビジュアル' },
        { value: 'code', icon: 'code', label: 'コード' },
      ]"
    />

    <!-- Visual Tab -->
    <div v-show="tab === 'visual'" :class="$style.panel">
      <!-- Presets -->
      <div :class="$style.section">
        <div :class="$style.sectionLabel">
          <i class="ti ti-template" />
          プリセット
        </div>

        <div :class="$style.estimateBar">
          <div :class="$style.estimateItem">
            <i class="ti ti-cpu" />
            メモリ: <strong>約 {{ perfStore.estimatedMemoryMB }} MB</strong>
          </div>
          <div :class="$style.estimateSep" />
          <div :class="$style.estimateItem">
            <i class="ti ti-network" />
            通信量: <strong>約 {{ perfStore.estimatedNetworkMBPerHour }} MB/時間</strong>
          </div>
        </div>
        <div :class="$style.presetRow">
          <button
            v-for="(preset, key) in PRESETS"
            :key="key"
            class="_button"
            :class="[$style.presetBtn, { [$style.presetActive]: perfStore.activePreset === key }]"
            @click="selectPreset(key as PresetKey)"
          >
            <i :class="'ti ' + preset.icon" />
            {{ preset.label }}
          </button>
          <div v-if="perfStore.activePreset === 'custom'" :class="$style.presetCustom">
            <i class="ti ti-settings" />
            カスタム
          </div>
        </div>
      </div>

      <!-- Category sections -->
      <div
        v-for="[catKey, fields] in categories"
        :key="catKey"
        :class="$style.section"
      >
        <button
          class="_button"
          :class="$style.sectionLabel"
          @click="toggleSection(catKey)"
        >
          <i :class="'ti ' + CATEGORY_LABELS[catKey]?.icon" />
          {{ CATEGORY_LABELS[catKey]?.label }}
          <i
            class="ti ti-chevron-down"
            :class="[$style.chevron, { [$style.chevronOpen]: expandedSections.has(catKey) }]"
          />
        </button>
        <template v-if="expandedSections.has(catKey)">
          <div v-for="field in fields" :key="field.key" :class="$style.field">
            <div :class="$style.fieldHeader">
              <span :class="$style.fieldLabel">{{ field.meta.label }}</span>
              <div :class="$style.fieldValue">
                <input
                  type="number"
                  :class="$style.numberInput"
                  :value="perfStore.get(field.key)"
                  :min="field.meta.min"
                  :max="field.meta.max"
                  :step="field.meta.step"
                  @change="handleNumberInput(field.key, $event)"
                />
                <span :class="$style.fieldUnit">{{ field.meta.unit }}</span>
                <button
                  v-if="perfStore.isCustomized(field.key)"
                  class="_button"
                  :class="$style.resetBtn"
                  :title="'デフォルト: ' + perfStore.getDefault(field.key)"
                  @click="perfStore.resetKey(field.key)"
                >
                  <i class="ti ti-restore" />
                </button>
              </div>
            </div>
            <input
              type="range"
              :class="$style.slider"
              :value="perfStore.get(field.key)"
              :min="field.meta.min"
              :max="field.meta.max"
              :step="field.meta.step"
              @input="handleSlider(field.key, $event)"
            />
            <div :class="$style.fieldDesc">{{ field.meta.description }}</div>
          </div>
        </template>
      </div>
    </div>

    <!-- Code Tab -->
    <div v-show="tab === 'code'" :class="$style.codePanel">
      <div :class="$style.codeHint">
        デフォルト値からの差分のみがJSON形式で保存されます
      </div>
      <CodeEditor
        v-model="code"
        :language="jsonLang"
        :class="$style.codeEditorWrap"
      />
      <div v-if="codeError" :class="$style.errorMessage">
        <i class="ti ti-alert-triangle" />
        {{ codeError }}
      </div>
      <div v-else-if="code.trim() && code.trim() !== '{}'" :class="$style.codeSuccess">
        <i class="ti ti-check" />
        適用中
      </div>
    </div>

    <!-- Actions -->
    <div :class="$style.actions">
      <div :class="$style.actionGroup">
        <button
          class="_button"
          :class="[$style.actionBtn, $style.secondary, { [$style.feedback]: importedMessage || importError }]"
          @click="importConfig"
        >
          <i class="ti" :class="importError ? 'ti-alert-circle' : 'ti-clipboard-text'" />
          {{ importError ? '無効' : importedMessage ? '読込済み' : 'インポート' }}
        </button>
        <button
          class="_button"
          :class="[$style.actionBtn, $style.secondary, { [$style.feedback]: copiedMessage }]"
          @click="exportConfig"
        >
          <i class="ti ti-clipboard-copy" />
          {{ copiedMessage ? 'コピー済み' : 'エクスポート' }}
        </button>
      </div>
      <button
        class="_button"
        :class="[$style.actionBtn, $style.danger, { [$style.confirming]: confirmingReset }]"
        @click="handleReset"
      >
        <i class="ti ti-trash" />
        {{ confirmingReset ? '本当にリセット？' : 'すべてリセット' }}
      </button>
    </div>
  </div>
</template>

<style lang="scss" module>
@use '@/styles/buttons' as *;

.content {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
  overflow: hidden;
}

.confirming { /* modifier */ }
.presetActive { /* modifier */ }

.panel {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  scrollbar-color: var(--nd-scrollbarHandle) transparent;
  scrollbar-width: thin;
}

.section {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px 10px;
  border-bottom: 1px solid var(--nd-divider);
}

.sectionLabel {
  display: flex;
  align-items: center;
  gap: 6px;
  width: 100%;
  font-size: 0.8em;
  font-weight: bold;
  opacity: 0.7;
  cursor: pointer;
  transition: opacity var(--nd-duration-base);

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

// --- Presets ---

.estimateBar {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 10px;
  border-radius: var(--nd-radius-sm);
  background: color-mix(in srgb, var(--nd-accent) 8%, var(--nd-bg));
  color: var(--nd-fg);
  font-size: 0.72em;

  strong {
    color: var(--nd-accent);
  }
}

.estimateItem {
  display: flex;
  align-items: center;
  gap: 4px;
  white-space: nowrap;
}

.estimateSep {
  width: 1px;
  height: 12px;
  background: var(--nd-divider);
  flex-shrink: 0;
}

.presetRow {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}

.presetBtn {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 5px 10px;
  border: 1px solid var(--nd-divider);
  border-radius: var(--nd-radius-sm);
  background: var(--nd-bg);
  color: var(--nd-fg);
  font-size: 0.75em;
  transition: border-color var(--nd-duration-base), background var(--nd-duration-base);

  &:hover {
    background: var(--nd-buttonHoverBg);
  }

  &.presetActive {
    border-color: var(--nd-accent);
    color: var(--nd-accent);
    background: color-mix(in srgb, var(--nd-accent) 8%, var(--nd-bg));
  }
}

.presetCustom {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 5px 10px;
  font-size: 0.75em;
  opacity: 0.5;
}

// --- Fields ---

.field {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 4px 0;
}

.fieldHeader {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.fieldLabel {
  font-size: 0.78em;
  font-weight: 500;
}

.fieldValue {
  display: flex;
  align-items: center;
  gap: 4px;
}

.numberInput {
  width: 64px;
  padding: 2px 4px;
  border: 1px solid var(--nd-divider);
  border-radius: var(--nd-radius-sm);
  background: var(--nd-bg);
  color: var(--nd-fg);
  font-size: 0.75em;
  text-align: right;
  outline: none;
  transition: border-color var(--nd-duration-base);

  &:focus {
    border-color: var(--nd-accent);
  }

  // Hide spinner arrows
  &::-webkit-inner-spin-button,
  &::-webkit-outer-spin-button {
    -webkit-appearance: none;
    margin: 0;
  }
  -moz-appearance: textfield;
}

.fieldUnit {
  font-size: 0.7em;
  opacity: 0.5;
  min-width: 24px;
}

.resetBtn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  border-radius: var(--nd-radius-sm);
  font-size: 0.8em;
  opacity: 0.4;
  transition: opacity var(--nd-duration-base), color var(--nd-duration-base);

  &:hover {
    opacity: 1;
    color: var(--nd-accent);
  }
}

.slider {
  width: 100%;
  height: 4px;
  appearance: none;
  background: var(--nd-divider);
  border-radius: 2px;
  outline: none;
  cursor: pointer;

  &::-webkit-slider-thumb {
    appearance: none;
    width: 14px;
    height: 14px;
    border-radius: 50%;
    background: var(--nd-accent);
    cursor: pointer;
    transition: transform 0.1s;

    &:hover {
      transform: scale(1.2);
    }
  }

  &::-moz-range-thumb {
    width: 14px;
    height: 14px;
    border: none;
    border-radius: 50%;
    background: var(--nd-accent);
    cursor: pointer;
  }
}

.fieldDesc {
  font-size: 0.68em;
  opacity: 0.4;
  line-height: 1.3;
}

// --- Code Tab ---

.codePanel {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 10px;
  flex: 1;
  min-height: 0;
  overflow-y: auto;
}

.codeHint {
  font-size: 0.75em;
  opacity: 0.4;
}

.codeEditorWrap {
  flex: 1;
  min-height: 200px;
}

.errorMessage {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 6px 8px;
  border-radius: var(--nd-radius-sm);
  background: color-mix(in srgb, var(--nd-love) 10%, var(--nd-bg));
  color: var(--nd-love);
  font-size: 0.75em;
  word-break: break-all;
}

.codeSuccess {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 0.75em;
  color: var(--nd-accent);
  opacity: 0.7;
}

// --- Actions ---

.actions { @include action-bar; }
.actionGroup { @include action-group; }

.actionBtn {
  &.secondary { @include btn-action; }
  &.danger { @include btn-danger-ghost; }
}

.secondary { /* modifier */ }
.feedback { /* modifier */ }
.danger { /* modifier */ }
</style>
