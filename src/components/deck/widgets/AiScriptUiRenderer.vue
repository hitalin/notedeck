<script setup lang="ts">
import type { Interpreter } from '@syuilo/aiscript'
import type { VFn, Value } from '@syuilo/aiscript/built/dts/interpreter/value.js'
import type { UiComponent } from '@/aiscript/ui-types'

defineProps<{
  components: UiComponent[]
  interpreter: Interpreter | null
}>()

async function callHandler(handler: unknown, interpreter: Interpreter | null, arg?: Value) {
  if (!interpreter || !handler || typeof handler !== 'object') return
  const fn = handler as VFn
  if (fn.type !== 'fn') return
  try {
    await interpreter.execFn(fn, arg ? [arg] : [])
  } catch {
    // handler errors are silently ignored
  }
}
</script>

<template>
  <div class="ais-ui-renderer">
    <template v-for="comp in components" :key="comp.id">
      <!-- text -->
      <span v-if="comp.type === 'text'" class="ais-text">{{
        comp.props.text ?? ''
      }}</span>

      <!-- mfm -->
      <div v-else-if="comp.type === 'mfm'" class="ais-mfm">
        {{ comp.props.text ?? '' }}
      </div>

      <!-- button -->
      <button
        v-else-if="comp.type === 'button'"
        class="ais-button"
        :disabled="!!comp.props.disabled"
        @click="callHandler(comp.props.onClick, interpreter)"
      >
        {{ comp.props.text ?? '' }}
      </button>

      <!-- textInput -->
      <input
        v-else-if="comp.type === 'textInput'"
        class="ais-text-input"
        type="text"
        :placeholder="(comp.props.placeholder as string) ?? ''"
        :value="(comp.props.default as string) ?? ''"
        @input="
          (e) => {
            const val = (e.target as HTMLInputElement).value
            callHandler(comp.props.onInput, interpreter, { type: 'str', value: val } as Value)
          }
        "
      />

      <!-- numberInput -->
      <input
        v-else-if="comp.type === 'numberInput'"
        class="ais-number-input"
        type="number"
        :value="(comp.props.default as number) ?? 0"
        @input="
          (e) => {
            const val = Number((e.target as HTMLInputElement).value)
            callHandler(comp.props.onInput, interpreter, { type: 'num', value: val } as Value)
          }
        "
      />

      <!-- switch -->
      <label v-else-if="comp.type === 'switch'" class="ais-switch">
        <input
          type="checkbox"
          :checked="!!comp.props.default"
          @change="
            (e) => {
              const val = (e.target as HTMLInputElement).checked
              callHandler(comp.props.onChange, interpreter, { type: 'bool', value: val } as Value)
            }
          "
        />
        {{ comp.props.label ?? '' }}
      </label>

      <!-- select -->
      <select
        v-else-if="comp.type === 'select'"
        class="ais-select"
        :value="(comp.props.default as string) ?? ''"
        @change="
          (e) => {
            const val = (e.target as HTMLSelectElement).value
            callHandler(comp.props.onChange, interpreter, { type: 'str', value: val } as Value)
          }
        "
      >
        <option
          v-for="item in (comp.props.items as { text: string; value: string }[]) ?? []"
          :key="item.value"
          :value="item.value"
        >
          {{ item.text }}
        </option>
      </select>

      <!-- container -->
      <div
        v-else-if="comp.type === 'container'"
        class="ais-container"
        :style="{
          textAlign: (comp.props.align as string) ?? undefined,
          backgroundColor: (comp.props.bgColor as string) ?? undefined,
          color: (comp.props.fgColor as string) ?? undefined,
          padding: (comp.props.padding as string) ? `${comp.props.padding}px` : undefined,
        }"
      >
        <AiScriptUiRenderer
          v-if="comp.children?.length"
          :components="comp.children"
          :interpreter="interpreter"
        />
      </div>

      <!-- folder -->
      <details v-else-if="comp.type === 'folder'" class="ais-folder">
        <summary>{{ comp.props.title ?? 'Folder' }}</summary>
        <AiScriptUiRenderer
          v-if="comp.children?.length"
          :components="comp.children"
          :interpreter="interpreter"
        />
      </details>
    </template>
  </div>
</template>

<style scoped>
.ais-ui-renderer {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.ais-text {
  white-space: pre-wrap;
  word-break: break-word;
  font-size: 0.85em;
  line-height: 1.5;
}

.ais-mfm {
  white-space: pre-wrap;
  word-break: break-word;
  font-size: 0.85em;
  line-height: 1.5;
}

.ais-button {
  padding: 7px 14px;
  border: none;
  border-radius: 6px;
  background: var(--nd-buttonBg);
  color: var(--nd-fg);
  cursor: pointer;
  font-size: 0.85em;
  transition: background 0.1s;
}

.ais-button:hover:not(:disabled) {
  background: var(--nd-buttonHoverBg);
}

.ais-button:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.ais-text-input,
.ais-number-input,
.ais-select {
  padding: 6px 10px;
  border: none;
  border-radius: 6px;
  background: var(--nd-buttonBg);
  color: var(--nd-fg);
  font-size: 0.85em;
  outline: none;
  transition: box-shadow 0.15s;
}

.ais-text-input:focus,
.ais-number-input:focus,
.ais-select:focus {
  box-shadow: 0 0 0 2px var(--nd-accent);
}

.ais-switch {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 0.85em;
  cursor: pointer;
}

.ais-container {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.ais-folder {
  border: 1px solid var(--nd-divider);
  border-radius: 8px;
  overflow: hidden;
}

.ais-folder summary {
  cursor: pointer;
  padding: 6px 10px;
  font-size: 0.85em;
  font-weight: 500;
  background: var(--nd-panelHighlight);
  transition: background 0.15s;
}

.ais-folder summary:hover {
  background: var(--nd-buttonHoverBg);
}

.ais-folder > :deep(.ais-ui-renderer) {
  padding: 8px 10px;
}
</style>
