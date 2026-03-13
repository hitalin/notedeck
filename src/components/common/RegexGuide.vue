<script setup lang="ts">
import { computed, reactive } from 'vue'
import {
  buildRegexFromConditions,
  FILTER_CONDITION_LABELS,
  type FilterCondition,
  type FilterConditionType,
} from '@/utils/regexSearch'

const emit = defineEmits<{
  select: [pattern: string]
}>()

const conditions = reactive<FilterCondition[]>([
  { type: 'contains_any', words: '' },
])

const conditionTypes: FilterConditionType[] = [
  'contains_any',
  'contains_all',
  'excludes',
]

function cycleType(cond: FilterCondition) {
  const i = conditionTypes.indexOf(cond.type)
  const next = conditionTypes[(i + 1) % conditionTypes.length]
  if (next) cond.type = next
}

function addCondition() {
  conditions.push({ type: 'contains_any', words: '' })
}

function removeCondition(index: number) {
  if (conditions.length > 1) conditions.splice(index, 1)
}

const generatedPattern = computed(() => buildRegexFromConditions(conditions))
const hasWords = computed(() => conditions.some((c) => c.words.trim()))

function apply() {
  const pattern = generatedPattern.value
  if (pattern) emit('select', pattern)
}
</script>

<template>
  <div class="filter-builder _popup" @click.stop>
    <div class="builder-header">フィルタ条件</div>

    <div class="conditions">
      <div v-for="(cond, i) in conditions" :key="i" class="condition-row">
        <button class="_button condition-type" @click="cycleType(cond)">
          {{ FILTER_CONDITION_LABELS[cond.type] }}
        </button>
        <input
          v-model="cond.words"
          class="condition-words"
          type="text"
          placeholder="カンマ区切りで単語を入力"
          @keydown.enter="apply"
        />
        <button
          v-if="conditions.length > 1"
          class="_button condition-remove"
          @click="removeCondition(i)"
        >
          <i class="ti ti-x" />
        </button>
      </div>
    </div>

    <div class="builder-footer">
      <button class="_button add-btn" @click="addCondition">
        <i class="ti ti-plus" />
        条件を追加
      </button>
      <button
        class="_button apply-btn"
        :disabled="!hasWords"
        @click="apply"
      >
        適用
      </button>
    </div>

    <div v-if="generatedPattern" class="pattern-preview">
      <code>{{ generatedPattern }}</code>
    </div>
  </div>
</template>

<style scoped>
.filter-builder {
  width: 320px;
  max-height: 400px;
  overflow-y: auto;
  padding: 8px 0;
  font-size: 0.9em;
  color: var(--nd-fg);
  scrollbar-width: thin;
  scrollbar-color: var(--nd-scrollbarHandle) transparent;
}

.builder-header {
  padding: 8px 14px 4px;
  font-size: 0.75em;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  opacity: 0.5;
}

.conditions {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 4px 10px;
}

.condition-row {
  display: flex;
  align-items: center;
  gap: 4px;
}

.condition-type {
  flex-shrink: 0;
  padding: 5px 8px;
  border-radius: var(--nd-radius-sm);
  background: var(--nd-buttonBg, rgba(255, 255, 255, 0.05));
  color: var(--nd-fg);
  font-size: 0.8em;
  white-space: nowrap;
  transition: background var(--nd-duration-base);
}

.condition-type:hover {
  background: var(--nd-buttonHoverBg, rgba(255, 255, 255, 0.1));
}

.condition-words {
  flex: 1;
  min-width: 0;
  padding: 5px 8px;
  border: none;
  border-radius: var(--nd-radius-sm);
  background: var(--nd-buttonBg, rgba(255, 255, 255, 0.05));
  color: var(--nd-fg);
  font-size: 0.85em;
  outline: none;
}

.condition-words:focus {
  box-shadow: 0 0 0 2px var(--nd-accent);
}

.condition-words::placeholder {
  color: var(--nd-fg);
  opacity: 0.3;
}

.condition-remove {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  border-radius: var(--nd-radius-sm);
  flex-shrink: 0;
  opacity: 0.3;
  transition: opacity var(--nd-duration-base), background var(--nd-duration-base);
}

.condition-remove:hover {
  background: var(--nd-buttonHoverBg, rgba(255, 255, 255, 0.1));
  opacity: 0.7;
}

.builder-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 10px 4px;
}

.add-btn {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 4px 8px;
  border-radius: var(--nd-radius-sm);
  font-size: 0.8em;
  opacity: 0.45;
  transition: opacity var(--nd-duration-base), background var(--nd-duration-base);
}

.add-btn:hover {
  background: var(--nd-buttonHoverBg, rgba(255, 255, 255, 0.1));
  opacity: 0.8;
}

.apply-btn {
  padding: 5px 14px;
  border-radius: var(--nd-radius-sm);
  background: var(--nd-accent);
  color: #fff;
  font-size: 0.8em;
  font-weight: 600;
  transition: opacity var(--nd-duration-base);
}

.apply-btn:hover:not(:disabled) {
  opacity: 0.85;
}

.apply-btn:disabled {
  opacity: 0.25;
}

.pattern-preview {
  margin: 4px 10px 4px;
  padding: 5px 8px;
  border-radius: var(--nd-radius-sm);
  background: color-mix(in srgb, var(--nd-accent) 8%, transparent);
  overflow-x: auto;
  scrollbar-width: none;
}

.pattern-preview code {
  font-family: monospace;
  font-size: 0.75em;
  color: var(--nd-accent);
  word-break: break-all;
}
</style>
