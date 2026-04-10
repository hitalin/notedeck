<script setup lang="ts">
import { json } from '@codemirror/lang-json'
import { computed, ref, watch } from 'vue'
import CodeEditor from '@/components/deck/widgets/CodeEditor.vue'
import { CURRENT_SCHEMA_VERSION, parseSettings } from '@/settings/schema'
import { useSettingsStore } from '@/stores/settings'

const jsonLang = json()
const settingsStore = useSettingsStore()

// Mirror the current settings as a pretty-printed JSON string
const jsonCode = ref(serializeSettings())

function serializeSettings(): string {
  return `${JSON.stringify(settingsStore.settings, null, 2)}\n`
}

// Sync from store → editor (when store changes externally, e.g. other store writes)
watch(
  () => settingsStore.settings,
  () => {
    // Only sync if the editor isn't currently being edited (avoid overwriting user typing)
    if (!dirty.value) {
      jsonCode.value = serializeSettings()
    }
  },
)

// --- Parse + save ---
const error = ref<string | null>(null)
const dirty = ref(false)
const saved = ref(false)
let saveTimer: ReturnType<typeof setTimeout> | null = null

watch(jsonCode, (code) => {
  dirty.value = true
  saved.value = false
  error.value = null

  if (saveTimer) clearTimeout(saveTimer)
  saveTimer = setTimeout(() => {
    try {
      const parsed = JSON.parse(code)
      if (!parsed || typeof parsed !== 'object') {
        error.value = 'トップレベルは JSON オブジェクト {} である必要があります'
        return
      }
      // Validate and normalize through the schema parser
      const normalized = parseSettings(parsed)
      normalized._schema = CURRENT_SCHEMA_VERSION

      // Apply all keys to settingsStore (replace the entire settings state)
      for (const [key, value] of Object.entries(normalized)) {
        // biome-ignore lint/suspicious/noExplicitAny: dynamic settings key
        settingsStore.set(key as any, value as any)
      }

      error.value = null
      dirty.value = false
      saved.value = true
      setTimeout(() => {
        saved.value = false
      }, 2000)
    } catch (e) {
      error.value = e instanceof Error ? e.message : '不正な JSON'
    }
  }, 600)
})

// Status text
const statusText = computed(() => {
  if (error.value) return error.value
  if (saved.value) return '保存しました'
  if (dirty.value) return '編集中...'
  return ''
})

const statusClass = computed(() => {
  if (error.value) return 'statusError'
  if (saved.value) return 'statusSaved'
  return ''
})
</script>

<template>
  <div :class="$style.content">
    <div :class="$style.hint">
      <i class="ti ti-braces" />
      notedeck.json を直接編集 — 変更は自動保存されます
    </div>

    <CodeEditor
      v-model="jsonCode"
      :language="jsonLang"
      :class="[$style.editor, { [$style.hasError]: error }]"
    />

    <div
      v-if="statusText"
      :class="[$style.status, $style[statusClass]]"
    >
      <i
        class="ti"
        :class="error ? 'ti-alert-triangle' : saved ? 'ti-check' : 'ti-loader-2'"
      />
      {{ statusText }}
    </div>
  </div>
</template>

<style module lang="scss">
.content {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
  overflow: hidden;
  padding: 8px 10px;
  gap: 6px;
}

.hint {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 0.75em;
  color: var(--nd-fgMuted);

  i {
    font-size: 1.1em;
  }
}

.editor {
  flex: 1;
  min-height: 200px;
  border-radius: var(--nd-radius-sm);
}

.hasError {
  box-shadow: 0 0 0 2px var(--nd-love);
}

.status {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 0.75em;
  color: var(--nd-fgMuted);
  min-height: 20px;
}

.statusError {
  color: var(--nd-love);
}

.statusSaved {
  color: var(--nd-accent);
}
</style>
