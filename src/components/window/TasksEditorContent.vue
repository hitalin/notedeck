<script setup lang="ts">
import { json as jsonLang } from '@codemirror/lang-json'
import { type Diagnostic, linter } from '@codemirror/lint'
import { onMounted, ref, watch } from 'vue'
import CodeEditor from '@/components/deck/widgets/CodeEditor.vue'
import defaultTasksJson5 from '@/defaults/tasks.json5?raw'
import { useTasksStore } from '@/stores/tasks'
import { useToast } from '@/stores/toast'
import { parseTasks, TasksParseError } from '@/tasks/schema'
import { isTauri, readTasks, writeTasks } from '@/utils/settingsFs'

const code = ref('')
const error = ref<string | null>(null)
const saving = ref(false)
const saved = ref(false)
const tasksStore = useTasksStore()

const tasksLinter = linter(
  (view) => {
    const diagnostics: Diagnostic[] = []
    const src = view.state.doc.toString()
    if (!src.trim()) return diagnostics
    try {
      parseTasks(src)
    } catch (e) {
      if (e instanceof TasksParseError) {
        diagnostics.push({
          from: 0,
          to: src.length,
          severity: 'error',
          message: e.message,
        })
      }
    }
    return diagnostics
  },
  { delay: 400 },
)

onMounted(async () => {
  if (!isTauri) {
    code.value = defaultTasksJson5
    return
  }
  try {
    const content = await readTasks()
    code.value = content || ''
  } catch (e) {
    error.value = `読込失敗: ${(e as Error).message}`
  }
})

let validateTimer: ReturnType<typeof setTimeout> | null = null
watch(code, (v) => {
  if (validateTimer) clearTimeout(validateTimer)
  validateTimer = setTimeout(() => {
    if (!v.trim()) {
      error.value = null
      return
    }
    try {
      parseTasks(v)
      error.value = null
    } catch (e) {
      error.value = e instanceof TasksParseError ? e.message : String(e)
    }
  }, 300)
})

async function save() {
  if (error.value) return
  saving.value = true
  try {
    await writeTasks(code.value)
    tasksStore.setFromRaw(code.value)
    saved.value = true
    setTimeout(() => {
      saved.value = false
    }, 1500)
  } catch (e) {
    useToast().show(`保存失敗: ${(e as Error).message}`, 'error')
  } finally {
    saving.value = false
  }
}

function insertSample() {
  code.value = defaultTasksJson5
}
</script>

<template>
  <div :class="$style.content">
    <div :class="$style.hint">
      <i class="ti ti-info-circle" />
      <span>
        タスクを宣言するとコマンドパレットと Task Runner カラムから実行できます。
        変数: <code>${input:&lt;id&gt;}</code> / <code>${account.id}</code> / <code>${account.host}</code>
      </span>
    </div>

    <CodeEditor
      v-model="code"
      :language="jsonLang()"
      :linter="tasksLinter"
      :class="[$style.editor, { [$style.hasError]: error }]"
      max-height="480px"
    />

    <div v-if="error" :class="$style.errorMessage">
      <i class="ti ti-alert-triangle" />
      {{ error }}
    </div>

    <div :class="$style.actions">
      <button
        class="_button"
        :class="[$style.btn, $style.secondary]"
        :disabled="code.trim() !== ''"
        @click="insertSample"
      >
        <i class="ti ti-file-plus" />
        サンプルを挿入
      </button>
      <button
        class="_button"
        :class="[$style.btn, $style.primary, { [$style.saved]: saved }]"
        :disabled="!!error || saving"
        @click="save"
      >
        <i class="ti" :class="saved ? 'ti-check' : 'ti-device-floppy'" />
        {{ saved ? '保存しました' : saving ? '保存中' : '保存' }}
      </button>
    </div>
  </div>
</template>

<style lang="scss" module>
.content {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 12px;
  flex: 1;
  min-height: 0;
  overflow-y: auto;
}

.hint {
  display: flex;
  align-items: flex-start;
  gap: 6px;
  padding: 8px 10px;
  border-radius: var(--nd-radius-sm);
  background: var(--nd-buttonBg);
  font-size: 0.75em;
  line-height: 1.5;
  color: var(--nd-fg);
  opacity: 0.75;

  i { flex-shrink: 0; margin-top: 1px; }
  code {
    font-family: var(--nd-font-mono, monospace);
    background: var(--nd-bg);
    padding: 1px 4px;
    border-radius: 3px;
  }
}

.editor {
  border-radius: var(--nd-radius-sm);
  overflow: hidden;

  &.hasError {
    box-shadow: 0 0 0 2px var(--nd-love);
  }
}

.hasError { /* modifier */ }

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

.actions {
  display: flex;
  gap: 8px;
  justify-content: flex-end;
}

.btn {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 6px 14px;
  border-radius: var(--nd-radius-sm);
  font-size: 0.85em;
  transition: background var(--nd-duration-base), opacity var(--nd-duration-base);

  &:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  &.secondary {
    background: var(--nd-buttonBg);
    color: var(--nd-fg);

    &:hover:not(:disabled) { background: var(--nd-buttonHoverBg); }
  }

  &.primary {
    background: var(--nd-accent);
    color: var(--nd-fgOnAccent);

    &:hover:not(:disabled) { opacity: 0.9; }
  }

  &.saved {
    background: var(--nd-success, #4a8);
  }
}

.secondary { /* modifier */ }
.primary { /* modifier */ }
.saved { /* modifier */ }
</style>
