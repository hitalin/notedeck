<script setup lang="ts">
import { computed } from 'vue'
import type { NormalizedDriveFile, NormalizedNote } from '@/adapters/types'
import MkFileGrid from '@/components/common/MkFileGrid.vue'
import { useNavigation } from '@/composables/useNavigation'

const props = defineProps<{
  accountId: string
  notes: readonly NormalizedNote[]
}>()

const { navigateToNote } = useNavigation()

// file.id → owning note のマップ。クリック時の遷移先決定用。
const noteByFileId = computed(() => {
  const m = new Map<string, NormalizedNote>()
  for (const note of props.notes) {
    for (const file of note.files) {
      m.set(file.id, note)
    }
  }
  return m
})

const flatFiles = computed(() => props.notes.flatMap((n) => n.files))

function onFileClick(file: NormalizedDriveFile) {
  const note = noteByFileId.value.get(file.id)
  if (note) navigateToNote(props.accountId, note.id)
}
</script>

<template>
  <MkFileGrid
    :files="flatFiles"
    :show-label="false"
    :style="{ '--mk-file-grid-columns': 'repeat(auto-fill, minmax(120px, 1fr))' }"
    @file-click="onFileClick"
  />
</template>
