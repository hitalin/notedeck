<script setup lang="ts">
import { json as jsonLang } from '@codemirror/lang-json'
import { type Diagnostic, linter } from '@codemirror/lint'
import { computed, onMounted, ref, watch } from 'vue'
import CodeEditor from '@/components/deck/widgets/CodeEditor.vue'
import { useClipboardFeedback } from '@/composables/useClipboardFeedback'
import { useDoubleConfirm } from '@/composables/useDoubleConfirm'
import defaultTasksJson5 from '@/defaults/tasks.json5?raw'
import { useTasksStore } from '@/stores/tasks'
import { useToast } from '@/stores/toast'
import { parseTasks, TasksParseError } from '@/tasks/schema'
import { isTauri, readTasks, writeTasks } from '@/utils/settingsFs'

const lang = jsonLang()

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

const tasksStore = useTasksStore()
const code = ref('')
const codeError = ref<string | null>(null)
const saving = ref(false)
const loaded = ref(false)

onMounted(async () => {
  if (!isTauri) {
    code.value = defaultTasksJson5
    loaded.value = true
    return
  }
  try {
    const content = await readTasks()
    code.value = content || defaultTasksJson5
  } catch (e) {
    useToast().show(`tasks.json5 読込失敗: ${(e as Error).message}`, 'error')
  } finally {
    loaded.value = true
  }
})

let validateTimer: ReturnType<typeof setTimeout> | null = null
watch(code, (v) => {
  if (validateTimer) clearTimeout(validateTimer)
  validateTimer = setTimeout(() => {
    if (!v.trim()) {
      codeError.value = null
      return
    }
    try {
      parseTasks(v)
      codeError.value = null
    } catch (e) {
      codeError.value = e instanceof TasksParseError ? e.message : String(e)
    }
  }, 400)
})

const taskCount = computed(() => tasksStore.definitions.length)

async function save() {
  if (codeError.value) return
  saving.value = true
  try {
    await writeTasks(code.value)
    tasksStore.setFromRaw(code.value)
    useToast().show(
      `tasks.json5 を保存しました (${taskCount.value} タスク)`,
      'success',
    )
  } catch (e) {
    useToast().show(`保存失敗: ${(e as Error).message}`, 'error')
  } finally {
    saving.value = false
  }
}

const {
  copied: copiedMessage,
  imported: importedMessage,
  importError,
  showCopied,
  showImported,
  showImportError,
} = useClipboardFeedback()

function exportTasks() {
  navigator.clipboard.writeText(code.value)
  showCopied()
}

async function importTasks() {
  try {
    const text = await navigator.clipboard.readText()
    if (!text.trim()) {
      showImportError()
      return
    }
    parseTasks(text)
    code.value = text
    showImported()
  } catch {
    showImportError()
  }
}

const { confirming: confirmingReset, trigger: triggerReset } =
  useDoubleConfirm()

function handleReset() {
  triggerReset(() => {
    code.value = defaultTasksJson5
  })
}
</script>

<template>
  <div :class="$style.content">
    <div :class="$style.codePanel">
      <div :class="$style.codeHint">
        宣言したタスクはコマンドパレットと Task Runner カラムから実行できます。
        変数: <code>${'$'}{input:&lt;id&gt;}</code>
        <code>${'$'}{account.id}</code>
        <code>${'$'}{account.host}</code>
      </div>
      <CodeEditor
        v-model="code"
        :language="lang"
        :linter="tasksLinter"
        :class="[$style.codeEditorWrap, { [$style.hasError]: codeError }]"
        auto-height
      />
      <div v-if="codeError" :class="$style.errorMessage">
        <i class="ti ti-alert-triangle" />
        {{ codeError }}
      </div>
      <div v-else-if="loaded && code.trim()" :class="$style.codeSuccess">
        <i class="ti ti-check" />
        {{ taskCount }} タスクを解析済み
      </div>
      <button
        class="_button"
        :class="$style.codeApplyBtn"
        :disabled="!!codeError || saving"
        @click="save"
      >
        <i class="ti" :class="saving ? 'ti-loader-2 nd-spin' : 'ti-device-floppy'" />
        {{ saving ? '保存中' : '保存' }}
      </button>
    </div>

    <div :class="$style.actions">
      <div :class="$style.actionGroup">
        <button
          class="_button"
          :class="[$style.actionBtn, $style.secondary, { [$style.feedback]: importedMessage || importError }]"
          @click="importTasks"
        >
          <i class="ti" :class="importError ? 'ti-alert-circle' : 'ti-clipboard-text'" />
          {{ importError ? '無効' : importedMessage ? '読込済み' : 'インポート' }}
        </button>
        <button
          class="_button"
          :class="[$style.actionBtn, $style.secondary, { [$style.feedback]: copiedMessage }]"
          @click="exportTasks"
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
        {{ confirmingReset ? '本当にリセット？' : 'サンプルに戻す' }}
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
  line-height: 1.55;
  opacity: 0.5;

  code {
    font-family: var(--nd-font-mono, monospace);
    background: var(--nd-buttonBg);
    padding: 1px 4px;
    margin: 0 2px;
    border-radius: 3px;
    white-space: nowrap;
  }
}

.codeEditorWrap {
  &.hasError {
    box-shadow: 0 0 0 2px var(--nd-love);
    border-radius: var(--nd-radius-sm);
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

.codeSuccess {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 0.75em;
  color: var(--nd-accent);
  opacity: 0.7;
}

.codeApplyBtn { @include btn-secondary; }

.actions { @include action-bar; }
.actionGroup { @include action-group; }

.actionBtn {
  &.secondary { @include btn-action; }
  &.danger { @include btn-danger-ghost; }
}

.secondary { /* modifier */ }
.feedback { /* modifier */ }
.danger { /* modifier */ }
.confirming { /* modifier */ }
</style>
