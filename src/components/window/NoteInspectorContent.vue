<script setup lang="ts">
import { computed, onMounted, ref, shallowRef, watch } from 'vue'
import type { JsonValue } from '@/bindings'
import EditorTabs from '@/components/common/EditorTabs.vue'
import RawJsonView from '@/components/common/RawJsonView.vue'
import { useEditorTabs } from '@/composables/useEditorTabs'
import { useSensitiveMask } from '@/composables/useSensitiveMask'
import { AppError } from '@/utils/errors'
import { commands, unwrap } from '@/utils/tauriInvoke'

const props = defineProps<{
  accountId: string
  noteId: string
  /** Known note URI (federated note `uri`, or local `url`). Optional. */
  noteUri?: string
  /** Server host — used to derive a URI when noteUri is absent. */
  serverHost?: string
}>()

// Notes themselves are mostly public, but DMs carry `visibleUserIds` and
// `myReaction` leaks the viewer's interaction state. Mask by default.
const SENSITIVE_RAW_KEYS = new Set<string>(['visibleUserIds', 'myReaction'])
const { showSensitive, formatJson } = useSensitiveMask(SENSITIVE_RAW_KEYS)

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

const derivedUri = computed(() => {
  if (props.noteUri) return props.noteUri
  if (props.serverHost)
    return `https://${props.serverHost}/notes/${props.noteId}`
  return null
})

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

    <RawJsonView
      ref="containerRef"
      v-model:show-sensitive="showSensitive"
      :json="currentJson"
      :loading="currentLoading"
      :error="currentError"
      :can-reveal="true"
    >
      <template #hint>
        <i class="ti ti-info-circle" />
        <template v-if="tab === 'misskey'">
          <code>/api/notes/show</code> の生レスポンス
        </template>
        <template v-else>
          <code>/api/ap/show</code> 経由で解決した ActivityPub オブジェクト
        </template>
      </template>
    </RawJsonView>
  </div>
</template>

<style module lang="scss">
.wrapper {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
}
</style>
