<script setup lang="ts">
import { computed, ref } from 'vue'
import type { NormalizedDriveFile } from '@/adapters/types'
import LoadingSpinner from '@/components/common/LoadingSpinner.vue'
import { isImage, safeUrl, useDriveFolder } from '@/composables/useDriveFolder'
import { useThemeStore } from '@/stores/theme'
import { AppError } from '@/utils/errors'
import { commands, unwrap } from '@/utils/tauriInvoke'

const props = defineProps<{
  accountId: string
}>()

const themeStore = useThemeStore()
const themeVars = computed(() =>
  themeStore.getStyleVarsForAccount(props.accountId),
)

const emit = defineEmits<{
  pick: [files: NormalizedDriveFile[]]
  close: []
}>()

const {
  currentFolderId,
  folderStack,
  folders,
  files,
  loading,
  error,
  fetchDrive,
  openFolder,
  goUp,
  selectedIds,
  toggleFile,
  selectedCount,
} = useDriveFolder({ accountId: () => props.accountId })

// --- Upload cell ---
const fileInput = ref<HTMLInputElement | null>(null)
const uploading = ref(false)
const uploadError = ref<string | null>(null)

function openFilePicker() {
  fileInput.value?.click()
}

async function onFileSelected(e: Event) {
  const input = e.target as HTMLInputElement
  if (!input.files?.length) return
  uploading.value = true
  uploadError.value = null
  try {
    const uploaded: NormalizedDriveFile[] = []
    for (const file of input.files) {
      const buf = await file.arrayBuffer()
      const result = unwrap(
        await commands.apiUploadFile(
          props.accountId,
          file.name,
          [...new Uint8Array(buf)],
          file.type || 'application/octet-stream',
          false,
          currentFolderId.value,
        ),
      )
      uploaded.push(result as unknown as NormalizedDriveFile)
    }
    await fetchDrive()
    // Auto-select uploaded files
    const next = new Set(selectedIds.value)
    for (const f of uploaded) next.add(f.id)
    selectedIds.value = next
  } catch (e) {
    uploadError.value = AppError.from(e).message
  } finally {
    uploading.value = false
    input.value = ''
  }
}

function confirm() {
  const picked = files.value.filter((f) => selectedIds.value.has(f.id))
  if (picked.length > 0) {
    emit('pick', picked)
  }
}

// Initial load
fetchDrive()
</script>

<template>
  <div :class="$style.drivePicker" :style="themeVars" @click.stop>
    <!-- Header -->
    <div :class="$style.dpHeader">
      <button v-if="folderStack.length > 0" class="_button" :class="$style.dpHeaderBtn" @click="goUp">
        <i class="ti ti-arrow-left" />
      </button>
      <span :class="$style.dpTitle">
        <i class="ti ti-cloud" />
        {{ folderStack.length > 0 ? folderStack[folderStack.length - 1]!.name : 'ドライブ' }}
      </span>
      <button class="_button" :class="$style.dpHeaderBtn" @click="emit('close')">
        <i class="ti ti-x" />
      </button>
    </div>

    <input
      ref="fileInput"
      type="file"
      multiple
      accept="image/*,video/*,audio/*"
      style="display: none"
      @change="onFileSelected"
    />

    <!-- Content -->
    <div :class="$style.dpContent">
      <div v-if="loading" :class="$style.dpEmpty"><LoadingSpinner /></div>
      <div v-else-if="error" :class="[$style.dpEmpty, $style.dpError]">{{ error }}</div>
      <template v-else>
        <!-- Folders -->
        <button
          v-for="folder in folders"
          :key="folder.id"
          class="_button"
          :class="$style.dpFolder"
          @click="openFolder(folder)"
        >
          <i class="ti ti-folder" />
          <span>{{ folder.name }}</span>
          <i class="ti ti-chevron-right" :class="$style.dpFolderArrow" />
        </button>

        <!-- Grid: upload cell + files -->
        <div :class="$style.dpGrid">
          <button
            class="_button"
            :class="$style.dpUploadCell"
            :disabled="uploading"
            title="アップロード"
            @click="openFilePicker"
          >
            <div :class="$style.dpUploadThumb">
              <i v-if="uploading" class="ti ti-loader-2 nd-spin" />
              <i v-else class="ti ti-plus" />
            </div>
            <div :class="$style.dpLabel">アップロード</div>
          </button>

          <button
            v-for="file in files"
            :key="file.id"
            class="_button"
            :class="[$style.dpGridCell, selectedIds.has(file.id) && $style.selected]"
            @click="toggleFile(file.id)"
          >
            <div :class="$style.dpThumb">
              <img
                v-if="isImage(file) && !file.isSensitive"
                :src="safeUrl(file.thumbnailUrl) || safeUrl(file.url)"
                :alt="file.name"
                :class="$style.dpThumbImg"
                loading="lazy"
              />
              <div v-else-if="file.isSensitive" :class="$style.dpThumbPlaceholder">
                <i class="ti ti-eye-off" />
              </div>
              <div v-else :class="$style.dpThumbPlaceholder">
                <i class="ti ti-file" />
              </div>
              <div :class="[$style.dpCheck, selectedIds.has(file.id) && $style.checked]">
                <i class="ti ti-check" />
              </div>
            </div>
            <div :class="$style.dpLabel">{{ file.name }}</div>
          </button>
        </div>

        <div v-if="uploadError" :class="$style.dpUploadError">{{ uploadError }}</div>
      </template>
    </div>

    <!-- Footer -->
    <div :class="$style.dpFooter">
      <span :class="$style.dpCount">{{ selectedCount }}件選択</span>
      <button
        class="_button"
        :class="$style.dpConfirm"
        :disabled="selectedCount === 0"
        @click="confirm"
      >
        添付
      </button>
    </div>
  </div>
</template>

<style lang="scss" module>
.drivePicker {
  width: 100%;
  max-width: 520px;
  max-height: min(75vh, 640px);
  margin: 0 16px 16px;
  display: flex;
  flex-direction: column;
  background: var(--nd-panelBg, var(--nd-popup));
  border-radius: 12px;
  box-shadow: 0 8px 32px var(--nd-shadow);
  overflow: hidden;
}

.dpHeader {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 12px;
  border-bottom: 1px solid var(--nd-divider);
  flex-shrink: 0;
}

.dpTitle {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 0.9em;
  font-weight: 600;
  color: var(--nd-fgHighlighted);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.dpHeaderBtn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border-radius: var(--nd-radius-sm);
  color: var(--nd-fg);
  opacity: 0.6;
  transition: opacity var(--nd-duration-base), background var(--nd-duration-base);

  &:hover {
    opacity: 1;
    background: var(--nd-buttonHoverBg);
  }
}

.dpContent {
  flex: 1;
  overflow-y: auto;
  scrollbar-color: var(--nd-scrollbarHandle) transparent;
  scrollbar-width: thin;
}

.dpEmpty {
  padding: 32px 16px;
  text-align: center;
  font-size: 0.85em;
  opacity: 0.5;
}

.dpError {
  color: var(--nd-love);
  opacity: 1;
}

.dpFolder {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 8px 12px;
  font-size: 0.8em;
  font-weight: 600;
  color: var(--nd-fgHighlighted);
  text-align: left;
  border-bottom: 1px solid var(--nd-divider);
  transition: background var(--nd-duration-base);

  &:hover {
    background: var(--nd-buttonHoverBg);
  }

  :global(.ti-folder) {
    color: var(--nd-accent);
    font-size: 16px;
  }
}

.dpFolderArrow {
  font-size: 12px;
  opacity: 0.3;
  margin-left: auto;
}

.dpGrid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 2px;
  padding: 2px;
}

.dpGridCell {
  display: flex;
  flex-direction: column;
  overflow: hidden;
  transition: opacity var(--nd-duration-base);

  &:hover {
    opacity: 0.85;
  }

  &.selected .dpThumb {
    outline: 3px solid var(--nd-accent);
    outline-offset: -3px;
  }
}

.dpUploadCell {
  display: flex;
  flex-direction: column;
  overflow: hidden;
  transition: opacity var(--nd-duration-base);

  &:hover .dpUploadThumb {
    opacity: 1;
    background: color-mix(in srgb, var(--nd-accent) 12%, transparent);
  }

  &:disabled .dpUploadThumb {
    opacity: 0.3;
  }
}

.dpUploadThumb {
  position: relative;
  aspect-ratio: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 28px;
  color: var(--nd-accent);
  opacity: 0.6;
  border: 2px dashed var(--nd-accent);
  border-radius: var(--nd-radius-md);
  background: color-mix(in srgb, var(--nd-accent) 5%, transparent);
  transition: opacity var(--nd-duration-base), background var(--nd-duration-base);
}

.dpUploadError {
  padding: 8px 12px;
  font-size: 0.75em;
  color: var(--nd-love);
}

.dpThumb {
  position: relative;
  aspect-ratio: 1;
  overflow: hidden;
  background: var(--nd-bg);
}

.dpThumbImg {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.dpThumbPlaceholder {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 20px;
  opacity: 0.3;
}

.dpCheck {
  position: absolute;
  top: 4px;
  left: 4px;
  width: 20px;
  height: 20px;
  border-radius: 50%;
  border: 2px solid rgba(255, 255, 255, 0.7);
  background: rgba(0, 0, 0, 0.3);
  display: flex;
  align-items: center;
  justify-content: center;
  color: transparent;
  font-size: 11px;
  transition: background var(--nd-duration-base), border-color var(--nd-duration-base), color var(--nd-duration-base);

  &.checked {
    background: var(--nd-accent);
    border-color: var(--nd-accent);
    color: #fff;
  }
}

.dpLabel {
  padding: 3px 4px;
  font-size: 0.6em;
  color: var(--nd-fg);
  opacity: 0.6;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  text-align: center;
}

.dpFooter {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 12px;
  border-top: 1px solid var(--nd-divider);
  flex-shrink: 0;
}

.dpCount {
  font-size: 0.8em;
  opacity: 0.5;
}

.dpConfirm {
  padding: 6px 20px;
  border-radius: var(--nd-radius-md);
  background: var(--nd-accent);
  color: var(--nd-fgOnAccent, #fff);
  font-size: 0.85em;
  font-weight: 600;
  transition: opacity var(--nd-duration-base);

  &:hover {
    opacity: 0.85;
  }

  &:disabled {
    opacity: 0.4;
    cursor: default;
  }
}
</style>
