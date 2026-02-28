<script setup lang="ts">
import {
  autocompletion,
  closeBrackets,
  closeBracketsKeymap,
} from '@codemirror/autocomplete'
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands'
import { bracketMatching } from '@codemirror/language'
import { lintGutter } from '@codemirror/lint'
import { EditorState } from '@codemirror/state'
import {
  placeholder as cmPlaceholder,
  EditorView,
  keymap,
} from '@codemirror/view'
import { onMounted, onUnmounted, ref, watch } from 'vue'
import { aiscriptCompletions } from '@/aiscript/codemirror/completions'
import { aiscriptLanguage } from '@/aiscript/codemirror/language'
import { aiscriptLinter } from '@/aiscript/codemirror/linter'
import { aiscriptTheme } from '@/aiscript/codemirror/theme'

const props = withDefaults(
  defineProps<{
    modelValue: string
    placeholder?: string
    maxHeight?: string
  }>(),
  {
    placeholder: '',
    maxHeight: '200px',
  },
)

const emit = defineEmits<{
  'update:modelValue': [value: string]
}>()

const editorRef = ref<HTMLDivElement>()
let view: EditorView | null = null
let isExternalUpdate = false

onMounted(() => {
  if (!editorRef.value) return

  const updateListener = EditorView.updateListener.of((update) => {
    if (update.docChanged && !isExternalUpdate) {
      emit('update:modelValue', update.state.doc.toString())
    }
  })

  view = new EditorView({
    state: EditorState.create({
      doc: props.modelValue,
      extensions: [
        aiscriptLanguage,
        aiscriptTheme,
        history(),
        bracketMatching(),
        closeBrackets(),
        autocompletion({ override: [aiscriptCompletions] }),
        aiscriptLinter,
        lintGutter(),
        keymap.of([...closeBracketsKeymap, ...defaultKeymap, ...historyKeymap]),
        cmPlaceholder(props.placeholder),
        updateListener,
        EditorView.lineWrapping,
      ],
    }),
    parent: editorRef.value,
  })
})

// Sync external changes into the editor
watch(
  () => props.modelValue,
  (newVal) => {
    if (!view) return
    const current = view.state.doc.toString()
    if (current === newVal) return

    isExternalUpdate = true
    view.dispatch({
      changes: { from: 0, to: current.length, insert: newVal },
    })
    isExternalUpdate = false
  },
)

onUnmounted(() => {
  view?.destroy()
  view = null
})
</script>

<template>
  <div ref="editorRef" class="ais-editor" :style="{ maxHeight }" />
</template>

<style scoped>
.ais-editor {
  border-radius: 6px;
  overflow: auto;
  background: var(--nd-bg);
  transition: box-shadow 0.15s;
}

.ais-editor:focus-within {
  box-shadow: 0 0 0 2px var(--nd-accent);
}

.ais-editor :deep(.cm-editor) {
  min-height: 80px;
}

.ais-editor :deep(.cm-scroller) {
  font-family: 'Fira Code', 'Cascadia Code', 'Consolas', monospace;
}
</style>
