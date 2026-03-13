<script setup lang="ts">
import { invoke } from '@tauri-apps/api/core'
import { onMounted, onUnmounted, ref } from 'vue'
import { MisskeyApi } from '@/adapters/misskey/api'
import type { NormalizedNote } from '@/adapters/types'
import { useAccountsStore } from '@/stores/accounts'
import { parseNoteUrl } from '@/utils/noteUrl'

const props = defineProps<{
  url: string
  accountId?: string
}>()

const note = ref<NormalizedNote | null>(null)
const loading = ref(false)
const failed = ref(false)
const el = ref<HTMLElement | null>(null)
let observer: IntersectionObserver | null = null

async function fetchNote() {
  const parsed = parseNoteUrl(props.url)
  if (!parsed || !props.accountId) {
    failed.value = true
    return
  }

  loading.value = true
  try {
    const accountsStore = useAccountsStore()
    const account = accountsStore.accountMap.get(props.accountId)
    const api = new MisskeyApi(props.accountId)

    if (account && account.host === parsed.host) {
      // Same server: direct fetch
      note.value = await api.getNote(parsed.noteId)
    } else {
      // Remote server: resolve via ap/show
      const result = await invoke<{ type: string; object?: { id: string } }>(
        'api_request',
        {
          accountId: props.accountId,
          endpoint: 'ap/show',
          params: { uri: props.url },
        },
      )
      if (result.type === 'Note' && result.object?.id) {
        note.value = await api.getNote(result.object.id)
      } else {
        failed.value = true
      }
    }
  } catch {
    failed.value = true
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  if (!el.value) return
  observer = new IntersectionObserver(
    ([entry]) => {
      if (entry?.isIntersecting) {
        observer?.disconnect()
        observer = null
        fetchNote()
      }
    },
    { rootMargin: '600px' },
  )
  observer.observe(el.value)
})

onUnmounted(() => {
  observer?.disconnect()
})
</script>

<template>
  <div ref="el" class="note-embed">
    <div v-if="loading" class="note-embed-skeleton">
      <div class="skeleton-line" style="width: 40%" />
      <div class="skeleton-line" style="width: 70%" />
    </div>
    <div v-else-if="note" class="note-embed-content">
      <MkNote :note="note" embedded />
    </div>
    <!-- failed: render nothing, let parent fall back to OGP -->
  </div>
</template>

<script lang="ts">
import MkNote from './MkNote.vue'
</script>

<style scoped>
.note-embed {
  margin-top: 8px;
}

.note-embed-content > :deep(.note-root) {
  padding: 12px 16px;
  border: dashed 1px var(--nd-renote);
  border-radius: var(--nd-radius-md);
}

.note-embed-skeleton {
  padding: 12px 16px;
  border: dashed 1px var(--nd-divider);
  border-radius: var(--nd-radius-md);
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.skeleton-line {
  height: 10px;
  border-radius: 4px;
  background: linear-gradient(
    90deg,
    var(--nd-buttonBg) 25%,
    var(--nd-panelHighlight) 50%,
    var(--nd-buttonBg) 75%
  );
  background-size: 200% 100%;
  animation: shimmer 1.5s infinite;
}

@keyframes shimmer {
  0% { background-position: -200% 0; }
  100% { background-position: 200% 0; }
}
</style>
