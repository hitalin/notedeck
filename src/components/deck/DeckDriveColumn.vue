<script setup lang="ts">
import { invoke } from '@tauri-apps/api/core'
import { computed, onMounted, onUnmounted, ref } from 'vue'
import type { NormalizedDriveFile } from '@/adapters/types'
import { useColumnTheme } from '@/composables/useColumnTheme'
import {
  formatFileSize,
  isAudio,
  isImage,
  isVideo,
  safeUrl,
  useDriveFolder,
} from '@/composables/useDriveFolder'
import type { DeckColumn as DeckColumnType } from '@/stores/deck'
import { AppError } from '@/utils/errors'
import DeckColumn from './DeckColumn.vue'

const props = defineProps<{
  column: DeckColumnType
}>()

const { account, columnThemeVars } = useColumnTheme(() => props.column)

const {
  folderStack,
  folders,
  files,
  loading,
  error,
  fetchDrive,
  openFolder: _openFolder,
  goUp: _goUp,
  goRoot: _goRoot,
  selectedIds,
  toggleFile,
  selectAll,
  deselectAll,
} = useDriveFolder({
  accountId: () => props.column.accountId ?? undefined,
  initialFolderId: props.column.folderId,
})

// --- Detail view ---
const detailFile = ref<NormalizedDriveFile | null>(null)
const deleting = ref(false)
const deleteError = ref<string | null>(null)

function openFolder(folder: Parameters<typeof _openFolder>[0]) {
  detailFile.value = null
  _openFolder(folder)
}

function goUp() {
  if (detailFile.value) {
    detailFile.value = null
    deleteError.value = null
    return
  }
  _goUp()
}

function goRoot() {
  detailFile.value = null
  deleteError.value = null
  _goRoot()
}

function openDetail(file: NormalizedDriveFile) {
  detailFile.value = file
  deleteError.value = null
}

async function deleteFile() {
  if (!detailFile.value || !props.column.accountId || deleting.value) return
  deleting.value = true
  deleteError.value = null
  try {
    await invoke('api_request', {
      accountId: props.column.accountId,
      endpoint: 'drive/files/delete',
      params: { fileId: detailFile.value.id },
    })
    files.value = files.value.filter((f) => f.id !== detailFile.value?.id)
    detailFile.value = null
  } catch (e) {
    deleteError.value = AppError.from(e).message
  } finally {
    deleting.value = false
  }
}

const canGoUp = computed(() => {
  return detailFile.value !== null || folderStack.value.length > 0
})

// --- Selection mode ---
const selectMode = ref(false)

function toggleSelectMode() {
  selectMode.value = !selectMode.value
  if (!selectMode.value) {
    deselectAll()
  }
}

const batchDeleting = ref(false)
const batchDeleteError = ref<string | null>(null)

async function batchDelete() {
  if (
    !props.column.accountId ||
    batchDeleting.value ||
    selectedIds.value.size === 0
  )
    return
  batchDeleting.value = true
  batchDeleteError.value = null
  const idsToDelete = [...selectedIds.value]
  try {
    for (const fileId of idsToDelete) {
      await invoke('api_request', {
        accountId: props.column.accountId,
        endpoint: 'drive/files/delete',
        params: { fileId },
      })
      files.value = files.value.filter((f) => f.id !== fileId)
    }
    deselectAll()
    selectMode.value = false
  } catch (e) {
    batchDeleteError.value = AppError.from(e).message
  } finally {
    batchDeleting.value = false
  }
}

function onFileClick(file: NormalizedDriveFile) {
  if (selectMode.value) {
    toggleFile(file.id)
  } else {
    openDetail(file)
  }
}

// --- File upload ---
const fileInput = ref<HTMLInputElement | null>(null)
const uploading = ref(false)

function openFilePicker() {
  fileInput.value?.click()
}

async function onFileSelected(e: Event) {
  const input = e.target as HTMLInputElement
  if (!input.files?.length || !props.column.accountId) return
  uploading.value = true
  try {
    for (const file of input.files) {
      const buf = await file.arrayBuffer()
      await invoke('api_upload_file', {
        accountId: props.column.accountId,
        fileName: file.name,
        fileData: [...new Uint8Array(buf)],
        contentType: file.type || 'application/octet-stream',
        isSensitive: false,
      })
    }
    fetchDrive()
  } finally {
    uploading.value = false
    input.value = ''
  }
}

// Listen for external drive-files-changed events (e.g. from file drop)
function onDriveFilesChanged(e: Event) {
  const detail = (e as CustomEvent).detail
  if (detail?.accountId === props.column.accountId) {
    fetchDrive()
  }
}

onMounted(() => {
  window.addEventListener('drive-files-changed', onDriveFilesChanged)
})

onUnmounted(() => {
  window.removeEventListener('drive-files-changed', onDriveFilesChanged)
})

// Initial load
fetchDrive()
</script>

<template>
  <DeckColumn :column-id="column.id" :title="column.name ?? 'ドライブ'" :theme-vars="columnThemeVars">
    <template #header-icon>
      <i class="ti ti-cloud tl-header-icon" />
    </template>

    <template #header-meta>
      <button v-if="canGoUp" class="_button header-refresh" title="戻る" @click.stop="goUp">
        <i class="ti ti-arrow-left" />
      </button>
      <button v-if="folderStack.length > 1" class="_button header-refresh" title="ルート" @click.stop="goRoot">
        <i class="ti ti-home" />
      </button>
      <button v-if="!detailFile" class="_button header-refresh" :class="{ 'header-btn-active': selectMode }" title="選択" @click.stop="toggleSelectMode">
        <i class="ti ti-checkbox" />
      </button>
      <button v-if="!detailFile && !selectMode" class="_button header-refresh" title="アップロード" :disabled="uploading" @click.stop="openFilePicker">
        <i class="ti ti-upload" />
      </button>
      <button v-if="!detailFile && !selectMode" class="_button header-refresh" title="更新" :disabled="loading" @click.stop="fetchDrive()">
        <i class="ti ti-refresh" :class="{ spin: loading }" />
      </button>
      <div v-if="account" class="header-account">
        <img v-if="account.avatarUrl" :src="account.avatarUrl" class="header-avatar" />
      </div>
    </template>

    <input
      ref="fileInput"
      type="file"
      multiple
      style="display: none"
      @change="onFileSelected"
    />

    <!-- Detail view -->
    <template v-if="detailFile">
      <div class="drive-detail-scroll">
        <div class="drive-detail">
          <div class="drive-detail-preview">
            <img
              v-if="isImage(detailFile)"
              :src="safeUrl(detailFile.url)"
              :alt="detailFile.name"
              class="drive-detail-image"
            />
            <video
              v-else-if="isVideo(detailFile)"
              :src="safeUrl(detailFile.url)"
              class="drive-detail-video"
              controls
            />
            <audio
              v-else-if="isAudio(detailFile)"
              :src="safeUrl(detailFile.url)"
              controls
              class="drive-detail-audio"
            />
            <div v-else class="drive-detail-placeholder">
              <i class="ti ti-file" />
            </div>
          </div>
          <div class="drive-detail-info">
            <div class="drive-detail-name">{{ detailFile.name }}</div>
            <div class="drive-detail-meta">
              <span>{{ detailFile.type }}</span>
              <span>{{ formatFileSize(detailFile.size) }}</span>
            </div>
            <div v-if="detailFile.isSensitive" class="drive-detail-sensitive">
              <i class="ti ti-eye-off" /> NSFW
            </div>
          </div>
          <div class="drive-detail-actions">
            <button
              class="_button drive-delete-btn"
              :disabled="deleting"
              @click="deleteFile"
            >
              <i class="ti ti-trash" />
              {{ deleting ? '削除中...' : '削除' }}
            </button>
          </div>
          <div v-if="deleteError" class="drive-detail-error">{{ deleteError }}</div>
        </div>
      </div>
    </template>

    <!-- Grid view -->
    <template v-else>
      <!-- Breadcrumb -->
      <div v-if="folderStack.length > 0" class="drive-breadcrumb">
        <button class="_button drive-breadcrumb-item" @click="goRoot">
          <i class="ti ti-cloud" />
        </button>
        <template v-for="(folder, i) in folderStack" :key="folder.id">
          <i class="ti ti-chevron-right drive-breadcrumb-sep" />
          <button
            class="_button drive-breadcrumb-item"
            :class="{ current: i === folderStack.length - 1 }"
            @click="i < folderStack.length - 1 ? openFolder(folder) : undefined"
          >
            {{ folder.name }}
          </button>
        </template>
      </div>

      <div class="drive-grid-scroll">
        <div v-if="loading" class="column-empty">読み込み中...</div>
        <div v-else-if="error" class="column-empty column-error">{{ error }}</div>
        <template v-else>
          <!-- Folders -->
          <button
            v-for="folder in folders"
            :key="folder.id"
            class="_button drive-folder-item"
            @click="openFolder(folder)"
          >
            <i class="ti ti-folder drive-folder-icon" />
            <span class="drive-folder-name">{{ folder.name }}</span>
            <i class="ti ti-chevron-right drive-folder-arrow" />
          </button>

          <!-- File grid -->
          <div class="drive-grid">
            <button
              v-if="!selectMode"
              class="_button drive-grid-cell drive-upload-cell"
              :disabled="uploading"
              @click="openFilePicker"
            >
              <div class="drive-grid-thumb drive-upload-thumb">
                <i v-if="uploading" class="ti ti-loader-2 spin" />
                <i v-else class="ti ti-plus" />
              </div>
              <div class="drive-grid-label">アップロード</div>
            </button>
            <button
              v-for="file in files"
              :key="file.id"
              class="_button drive-grid-cell"
              :class="{ selected: selectMode && selectedIds.has(file.id) }"
              @click="onFileClick(file)"
            >
              <div class="drive-grid-thumb">
                <img
                  v-if="isImage(file) && !file.isSensitive"
                  :src="safeUrl(file.thumbnailUrl) || safeUrl(file.url)"
                  :alt="file.name"
                  class="drive-grid-img"
                  loading="lazy"
                />
                <div v-else-if="file.isSensitive" class="drive-grid-placeholder">
                  <i class="ti ti-eye-off" />
                </div>
                <div v-else class="drive-grid-placeholder">
                  <i :class="isVideo(file) ? 'ti ti-video' : isAudio(file) ? 'ti ti-music' : 'ti ti-file'" />
                </div>
                <div v-if="isVideo(file) && !file.isSensitive" class="drive-grid-badge">
                  <i class="ti ti-player-play" />
                </div>
                <div v-if="selectMode" class="drive-select-check" :class="{ checked: selectedIds.has(file.id) }">
                  <i class="ti ti-check" />
                </div>
              </div>
              <div class="drive-grid-label">{{ file.name }}</div>
            </button>
          </div>
        </template>
      </div>

      <!-- Selection action bar -->
      <div v-if="selectMode" class="drive-action-bar">
        <div class="drive-action-info">
          <button class="_button drive-action-select-all" @click="selectedIds.size === files.length ? deselectAll() : selectAll()">
            {{ selectedIds.size === files.length ? '全解除' : '全選択' }}
          </button>
          <span class="drive-action-count">{{ selectedIds.size }}件選択</span>
        </div>
        <div v-if="batchDeleteError" class="drive-action-error">{{ batchDeleteError }}</div>
        <button
          class="_button drive-action-delete"
          :disabled="selectedIds.size === 0 || batchDeleting"
          @click="batchDelete"
        >
          <i class="ti ti-trash" />
          {{ batchDeleting ? '削除中...' : '削除' }}
        </button>
      </div>
    </template>
  </DeckColumn>
</template>

<style scoped>
@import "./column-common.css";

/* --- Breadcrumb --- */
.drive-breadcrumb {
  display: flex;
  align-items: center;
  gap: 2px;
  padding: 6px 10px;
  border-bottom: 1px solid var(--nd-divider);
  flex-shrink: 0;
  overflow-x: auto;
  scrollbar-width: none;
}

.drive-breadcrumb::-webkit-scrollbar {
  display: none;
}

.drive-breadcrumb-item {
  font-size: 0.75em;
  color: var(--nd-accent);
  white-space: nowrap;
  padding: 2px 4px;
  border-radius: 4px;
  transition: background var(--nd-duration-base);
}

.drive-breadcrumb-item:hover {
  background: var(--nd-buttonHoverBg);
}

.drive-breadcrumb-item.current {
  color: var(--nd-fg);
  cursor: default;
}

.drive-breadcrumb-sep {
  font-size: 10px;
  opacity: 0.3;
  flex-shrink: 0;
}

/* --- Grid scroll --- */
.drive-grid-scroll {
  flex: 1;
  overflow-y: auto;
  scrollbar-color: var(--nd-scrollbarHandle) transparent;
  scrollbar-width: thin;
}

/* --- Folder items --- */
.drive-folder-item {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 10px 14px;
  text-align: left;
  border-bottom: 1px solid var(--nd-divider);
  transition: background var(--nd-duration-base);
}

.drive-folder-item:hover {
  background: var(--nd-buttonHoverBg);
}

.drive-folder-icon {
  font-size: 20px;
  color: var(--nd-accent);
  flex-shrink: 0;
}

.drive-folder-name {
  flex: 1;
  font-size: 0.85em;
  font-weight: 600;
  color: var(--nd-fgHighlighted);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.drive-folder-arrow {
  font-size: 14px;
  opacity: 0.3;
  flex-shrink: 0;
}

/* --- File grid --- */
.drive-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 2px;
  padding: 2px;
}

.drive-grid-cell {
  display: flex;
  flex-direction: column;
  overflow: hidden;
  transition: opacity var(--nd-duration-base);
}

.drive-grid-cell:hover {
  opacity: 0.8;
}

.drive-grid-thumb {
  position: relative;
  aspect-ratio: 1;
  overflow: hidden;
  background: var(--nd-bg);
}

.drive-grid-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.drive-grid-placeholder {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 24px;
  opacity: 0.3;
}

.drive-grid-badge {
  position: absolute;
  bottom: 4px;
  right: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border-radius: 50%;
  background: var(--nd-overlayDark);
  color: #fff;
  font-size: 12px;
}

.drive-grid-label {
  padding: 4px 6px;
  font-size: 0.65em;
  color: var(--nd-fg);
  opacity: 0.7;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  text-align: center;
}

.drive-upload-thumb {
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

.drive-upload-cell:hover .drive-upload-thumb {
  opacity: 1;
  background: color-mix(in srgb, var(--nd-accent) 12%, transparent);
}

.drive-upload-cell:disabled .drive-upload-thumb {
  opacity: 0.3;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

.spin {
  animation: spin 1s linear infinite;
}

/* --- Detail view --- */
.drive-detail-scroll {
  flex: 1;
  overflow-y: auto;
  scrollbar-color: var(--nd-scrollbarHandle) transparent;
  scrollbar-width: thin;
}

.drive-detail {
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 16px;
}

.drive-detail-preview {
  border-radius: var(--nd-radius-md);
  overflow: hidden;
  background: var(--nd-bg);
}

.drive-detail-image {
  display: block;
  width: 100%;
  max-height: 400px;
  object-fit: contain;
}

.drive-detail-video {
  display: block;
  width: 100%;
  max-height: 400px;
}

.drive-detail-audio {
  display: block;
  width: 100%;
  padding: 16px;
}

.drive-detail-placeholder {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 120px;
  font-size: 48px;
  opacity: 0.2;
}

.drive-detail-info {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.drive-detail-name {
  font-size: 0.95em;
  font-weight: 600;
  color: var(--nd-fgHighlighted);
  word-break: break-all;
}

.drive-detail-meta {
  display: flex;
  gap: 12px;
  font-size: 0.8em;
  opacity: 0.6;
}

.drive-detail-sensitive {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 0.8em;
  color: var(--nd-love);
}

.drive-detail-actions {
  display: flex;
  gap: 8px;
}

.drive-delete-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 16px;
  border-radius: var(--nd-radius-md);
  background: var(--nd-love-hover);
  color: var(--nd-love);
  font-size: 0.85em;
  font-weight: 600;
  transition: background var(--nd-duration-base);
}

.drive-delete-btn:hover {
  background: color-mix(in srgb, var(--nd-love) 25%, transparent);
}

.drive-delete-btn:disabled {
  opacity: 0.5;
  cursor: default;
}

.drive-detail-error {
  font-size: 0.8em;
  color: var(--nd-love);
}

/* --- Selection mode --- */
.header-btn-active {
  color: var(--nd-accent);
  opacity: 1;
}

.drive-select-check {
  position: absolute;
  top: 4px;
  left: 4px;
  width: 22px;
  height: 22px;
  border-radius: 50%;
  border: 2px solid rgba(255, 255, 255, 0.7);
  background: rgba(0, 0, 0, 0.3);
  display: flex;
  align-items: center;
  justify-content: center;
  color: transparent;
  font-size: 12px;
  transition: all var(--nd-duration-base);
}

.drive-select-check.checked {
  background: var(--nd-accent);
  border-color: var(--nd-accent);
  color: #fff;
}

.drive-grid-cell.selected .drive-grid-thumb {
  outline: 3px solid var(--nd-accent);
  outline-offset: -3px;
}

.drive-action-bar {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 8px 12px;
  border-top: 1px solid var(--nd-divider);
  background: var(--nd-panelBg);
}

.drive-action-info {
  display: flex;
  align-items: center;
  gap: 8px;
}

.drive-action-count {
  font-size: 0.8em;
  opacity: 0.6;
}

.drive-action-select-all {
  font-size: 0.8em;
  color: var(--nd-accent);
  padding: 4px 8px;
  border-radius: var(--nd-radius-sm);
  transition: background var(--nd-duration-base);
}

.drive-action-select-all:hover {
  background: var(--nd-buttonHoverBg);
}

.drive-action-delete {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 6px 14px;
  border-radius: var(--nd-radius-md);
  background: var(--nd-love-hover);
  color: var(--nd-love);
  font-size: 0.8em;
  font-weight: 600;
  transition: background var(--nd-duration-base);
}

.drive-action-delete:hover {
  background: color-mix(in srgb, var(--nd-love) 25%, transparent);
}

.drive-action-delete:disabled {
  opacity: 0.4;
  cursor: default;
}

.drive-action-error {
  font-size: 0.75em;
  color: var(--nd-love);
  flex: 1;
  text-align: center;
}
</style>
