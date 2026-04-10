<script setup lang="ts">
import { json } from '@codemirror/lang-json'
import {
  computed,
  defineAsyncComponent,
  onMounted,
  ref,
  shallowRef,
  watch,
} from 'vue'
import type { JsonValue } from '@/bindings'
import EditorTabs from '@/components/common/EditorTabs.vue'
import LoadingSpinner from '@/components/common/LoadingSpinner.vue'
import { useClipboardFeedback } from '@/composables/useClipboardFeedback'
import { useEditorTabs } from '@/composables/useEditorTabs'
import { AppError } from '@/utils/errors'
import { commands, unwrap } from '@/utils/tauriInvoke'

const CodeEditor = defineAsyncComponent(
  () => import('@/components/deck/widgets/CodeEditor.vue'),
)

const props = defineProps<{
  accountId: string
  noteId: string
  /** Known note URI (federated note `uri`, or local `url`). Optional. */
  noteUri?: string
  /** Server host — used to derive a URI when noteUri is absent. */
  serverHost?: string
}>()

// Notes themselves are mostly public, but DMs carry `visibleUserIds` and
// `myReaction` leaks the viewer's interaction state. Mask by default, matching
// the approach in UserProfileContent's raw tab.
const SENSITIVE_RAW_KEYS = new Set<string>(['visibleUserIds', 'myReaction'])

function maskSensitive(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(maskSensitive)
  if (value && typeof value === 'object') {
    const result: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      result[k] = SENSITIVE_RAW_KEYS.has(k) ? '<hidden>' : maskSensitive(v)
    }
    return result
  }
  return value
}

type InspectorTab = 'misskey' | 'activitypub'
const TAB_DEFS: { value: InspectorTab; icon: string; label: string }[] = [
  { value: 'misskey', icon: 'code', label: 'Misskey API' },
  { value: 'activitypub', icon: 'world-www', label: 'ActivityPub' },
]
const TAB_VALUES: readonly InspectorTab[] = TAB_DEFS.map((t) => t.value)
const { tab, containerRef } = useEditorTabs<InspectorTab>(TAB_VALUES, 'misskey')

const misskeyRaw = shallowRef<unknown>(null)
const isLoadingMisskey = ref(false)
const misskeyError = ref<string | null>(null)

const apRaw = shallowRef<unknown>(null)
const isLoadingAp = ref(false)
const apError = ref<string | null>(null)

const showSensitive = ref(false)
const { copied, copyToClipboard } = useClipboardFeedback()
const jsonLang = json()

const derivedUri = computed(() => {
  if (props.noteUri) return props.noteUri
  if (props.serverHost)
    return `https://${props.serverHost}/notes/${props.noteId}`
  return null
})

function formatJson(value: unknown): string {
  if (value == null) return ''
  const obj = showSensitive.value ? value : maskSensitive(value)
  return JSON.stringify(obj, null, 2)
}

const misskeyJson = computed(() => formatJson(misskeyRaw.value))
const apJson = computed(() => formatJson(apRaw.value))

const currentJson = computed(() =>
  tab.value === 'misskey' ? misskeyJson.value : apJson.value,
)
const currentLoading = computed(() =>
  tab.value === 'misskey' ? isLoadingMisskey.value : isLoadingAp.value,
)
const currentError = computed(() =>
  tab.value === 'misskey' ? misskeyError.value : apError.value,
)

async function loadMisskey() {
  if (misskeyRaw.value != null || isLoadingMisskey.value) return
  isLoadingMisskey.value = true
  misskeyError.value = null
  try {
    misskeyRaw.value = unwrap(
      await commands.apiRequest(props.accountId, 'notes/show', {
        noteId: props.noteId,
      } as Record<string, JsonValue>),
    )
  } catch (e) {
    misskeyError.value = AppError.from(e).message
  } finally {
    isLoadingMisskey.value = false
  }
}

async function loadActivityPub() {
  if (apRaw.value != null || isLoadingAp.value) return
  const uri = derivedUri.value
  if (!uri) {
    apError.value = 'URI を特定できませんでした'
    return
  }
  isLoadingAp.value = true
  apError.value = null
  try {
    apRaw.value = unwrap(await commands.apiApShow(props.accountId, uri))
  } catch (e) {
    apError.value = AppError.from(e).message
  } finally {
    isLoadingAp.value = false
  }
}

onMounted(() => {
  loadMisskey()
})

// AP tab is lazy-loaded on first activation so opening the inspector doesn't
// trigger an extra round-trip the user may not need.
watch(tab, (t) => {
  if (t === 'activitypub') loadActivityPub()
})
</script>

<template>
  <div :class="$style.wrapper">
    <EditorTabs
      :tabs="TAB_DEFS"
      :model-value="tab"
      @update:model-value="(v) => (tab = v as InspectorTab)"
    />

    <div :class="$style.subHeader">
      <span :class="$style.hint">
        <i class="ti ti-info-circle" />
        <template v-if="tab === 'misskey'">
          <code>/api/notes/show</code> の生レスポンス
        </template>
        <template v-else>
          <code>/api/ap/show</code> 経由で解決した ActivityPub オブジェクト
        </template>
      </span>
      <div :class="$style.actions">
        <button
          class="_button"
          :class="[$style.btn, { [$style.active]: showSensitive }]"
          :title="showSensitive ? '機密を隠す' : '機密を表示'"
          @click="showSensitive = !showSensitive"
        >
          <i :class="showSensitive ? 'ti ti-eye-off' : 'ti ti-eye'" />
          {{ showSensitive ? '隠す' : '機密を表示' }}
        </button>
        <button
          class="_button"
          :class="$style.btn"
          :disabled="!currentJson || currentLoading"
          :title="copied ? 'コピーしました' : '表示中の JSON をコピー'"
          @click="copyToClipboard(currentJson)"
        >
          <i :class="copied ? 'ti ti-check' : 'ti ti-copy'" />
          {{ copied ? 'コピー済み' : 'コピー' }}
        </button>
      </div>
    </div>

    <div ref="containerRef" :class="$style.body">
      <div v-if="currentLoading" :class="$style.state">
        <LoadingSpinner />
      </div>
      <div v-else-if="currentError" :class="[$style.state, $style.error]">
        {{ currentError }}
      </div>
      <CodeEditor
        v-else-if="currentJson"
        :model-value="currentJson"
        :language="jsonLang"
        :read-only="true"
        :auto-height="true"
        :class="$style.editor"
      />
      <div v-else :class="$style.state">データがありません</div>
    </div>
  </div>
</template>

<style module lang="scss">
.wrapper {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
}

.subHeader {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  border-bottom: 1px solid var(--nd-divider);
  flex-shrink: 0;
}

.hint {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 0.75em;
  color: var(--nd-fg);
  opacity: 0.7;
  min-width: 0;

  code {
    font-family: 'Fira Code', 'Cascadia Code', 'Consolas', monospace;
    background: rgba(127, 127, 127, 0.15);
    padding: 1px 5px;
    border-radius: 3px;
    font-size: 0.9em;
  }
}

.actions {
  display: flex;
  gap: 4px;
  flex-shrink: 0;
}

.btn {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 4px 10px;
  font-size: 0.75em;
  border-radius: var(--nd-radius-sm);
  color: var(--nd-fg);
  opacity: 0.7;
  transition:
    background var(--nd-duration-fast),
    opacity var(--nd-duration-fast);

  &:hover:not(:disabled) {
    background: var(--nd-buttonHoverBg);
    opacity: 1;
  }

  &:disabled {
    opacity: 0.3;
    cursor: not-allowed;
  }

  &.active {
    color: var(--nd-accent);
    opacity: 1;
  }
}

.body {
  flex: 1;
  min-height: 0;
  overflow: auto;
  padding: 12px;
}

.editor {
  height: auto;
}

.state {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 32px;
  color: var(--nd-fg);
  opacity: 0.5;
  font-size: 0.85em;
}

.error {
  color: var(--nd-love);
  opacity: 1;
}
</style>
