<script setup lang="ts">
import type { NormalizedDriveFile } from '@/adapters/types'
import { isImage, safeUrl, useDriveFolder } from '@/composables/useDriveFolder'

const props = defineProps<{
  accountId: string
}>()

const emit = defineEmits<{
  pick: [files: NormalizedDriveFile[]]
  close: []
}>()

const {
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
  <div class="drive-picker" @click.stop>
    <!-- Header -->
    <div class="dp-header">
      <button v-if="folderStack.length > 0" class="_button dp-header-btn" @click="goUp">
        <i class="ti ti-arrow-left" />
      </button>
      <span class="dp-title">
        <i class="ti ti-cloud" />
        {{ folderStack.length > 0 ? folderStack[folderStack.length - 1]!.name : 'ドライブ' }}
      </span>
      <button class="_button dp-header-btn" @click="emit('close')">
        <i class="ti ti-x" />
      </button>
    </div>

    <!-- Content -->
    <div class="dp-content">
      <div v-if="loading" class="dp-empty">読み込み中...</div>
      <div v-else-if="error" class="dp-empty dp-error">{{ error }}</div>
      <template v-else>
        <!-- Folders -->
        <button
          v-for="folder in folders"
          :key="folder.id"
          class="_button dp-folder"
          @click="openFolder(folder)"
        >
          <i class="ti ti-folder" />
          <span>{{ folder.name }}</span>
          <i class="ti ti-chevron-right dp-folder-arrow" />
        </button>

        <!-- Files -->
        <div v-if="files.length > 0" class="dp-grid">
          <button
            v-for="file in files"
            :key="file.id"
            class="_button dp-grid-cell"
            :class="{ selected: selectedIds.has(file.id) }"
            @click="toggleFile(file.id)"
          >
            <div class="dp-thumb">
              <img
                v-if="isImage(file) && !file.isSensitive"
                :src="safeUrl(file.thumbnailUrl) || safeUrl(file.url)"
                :alt="file.name"
                class="dp-thumb-img"
                loading="lazy"
              />
              <div v-else-if="file.isSensitive" class="dp-thumb-placeholder">
                <i class="ti ti-eye-off" />
              </div>
              <div v-else class="dp-thumb-placeholder">
                <i class="ti ti-file" />
              </div>
              <div class="dp-check" :class="{ checked: selectedIds.has(file.id) }">
                <i class="ti ti-check" />
              </div>
            </div>
            <div class="dp-label">{{ file.name }}</div>
          </button>
        </div>

        <div v-if="folders.length === 0 && files.length === 0" class="dp-empty">
          ファイルがありません
        </div>
      </template>
    </div>

    <!-- Footer -->
    <div class="dp-footer">
      <span class="dp-count">{{ selectedCount }}件選択</span>
      <button
        class="_button dp-confirm"
        :disabled="selectedCount === 0"
        @click="confirm"
      >
        添付
      </button>
    </div>
  </div>
</template>

<style scoped>
.drive-picker {
  width: 100%;
  max-width: 520px;
  max-height: 50vh;
  margin: 0 16px 16px;
  display: flex;
  flex-direction: column;
  background: var(--nd-panelBg);
  border-radius: 12px;
  box-shadow: 0 8px 32px var(--nd-shadow);
  overflow: hidden;
}

.dp-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 12px;
  border-bottom: 1px solid var(--nd-divider);
  flex-shrink: 0;
}

.dp-title {
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

.dp-header-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border-radius: var(--nd-radius-sm);
  color: var(--nd-fg);
  opacity: 0.6;
  transition: opacity 0.15s, background 0.15s;
}

.dp-header-btn:hover {
  opacity: 1;
  background: var(--nd-buttonHoverBg);
}

.dp-content {
  flex: 1;
  overflow-y: auto;
  scrollbar-color: var(--nd-scrollbarHandle) transparent;
  scrollbar-width: thin;
}

.dp-empty {
  padding: 32px 16px;
  text-align: center;
  font-size: 0.85em;
  opacity: 0.5;
}

.dp-error {
  color: var(--nd-love);
  opacity: 1;
}

.dp-folder {
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
  transition: background 0.15s;
}

.dp-folder:hover {
  background: var(--nd-buttonHoverBg);
}

.dp-folder .ti-folder {
  color: var(--nd-accent);
  font-size: 16px;
}

.dp-folder-arrow {
  font-size: 12px;
  opacity: 0.3;
  margin-left: auto;
}

.dp-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 2px;
  padding: 2px;
}

.dp-grid-cell {
  display: flex;
  flex-direction: column;
  overflow: hidden;
  transition: opacity 0.15s;
}

.dp-grid-cell:hover {
  opacity: 0.85;
}

.dp-thumb {
  position: relative;
  aspect-ratio: 1;
  overflow: hidden;
  background: var(--nd-bg);
}

.dp-thumb-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.dp-thumb-placeholder {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 20px;
  opacity: 0.3;
}

.dp-check {
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
  transition: all 0.15s;
}

.dp-check.checked {
  background: var(--nd-accent);
  border-color: var(--nd-accent);
  color: #fff;
}

.dp-grid-cell.selected .dp-thumb {
  outline: 3px solid var(--nd-accent);
  outline-offset: -3px;
}

.dp-label {
  padding: 3px 4px;
  font-size: 0.6em;
  color: var(--nd-fg);
  opacity: 0.6;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  text-align: center;
}

.dp-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 12px;
  border-top: 1px solid var(--nd-divider);
  flex-shrink: 0;
}

.dp-count {
  font-size: 0.8em;
  opacity: 0.5;
}

.dp-confirm {
  padding: 6px 20px;
  border-radius: var(--nd-radius-md);
  background: var(--nd-accent);
  color: var(--nd-fgOnAccent, #fff);
  font-size: 0.85em;
  font-weight: 600;
  transition: opacity 0.15s;
}

.dp-confirm:hover {
  opacity: 0.85;
}

.dp-confirm:disabled {
  opacity: 0.4;
  cursor: default;
}
</style>
