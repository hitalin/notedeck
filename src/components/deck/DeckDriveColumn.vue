<script setup lang="ts">
import { invoke } from '@tauri-apps/api/core'
import { computed, ref } from 'vue'
import type { NormalizedDriveFile } from '@/adapters/types'
import { useAccountsStore } from '@/stores/accounts'
import type { DeckColumn as DeckColumnType } from '@/stores/deck'
import { useThemeStore } from '@/stores/theme'
import { AppError } from '@/utils/errors'
import { isSafeUrl } from '@/utils/url'
import DeckColumn from './DeckColumn.vue'

const props = defineProps<{
  column: DeckColumnType
}>()

const accountsStore = useAccountsStore()
const themeStore = useThemeStore()
const account = computed(() =>
  accountsStore.accounts.find((a) => a.id === props.column.accountId),
)
const columnThemeVars = computed(() => {
  const accountId = props.column.accountId
  if (!accountId) return undefined
  return themeStore.getStyleVarsForAccount(accountId)
})

// --- Folder navigation ---
interface DriveFolder {
  id: string
  name: string
  parentId: string | null
}

const currentFolderId = ref<string | null>(props.column.folderId ?? null)
const folderStack = ref<DriveFolder[]>([])
const folders = ref<DriveFolder[]>([])
const files = ref<NormalizedDriveFile[]>([])
const loading = ref(false)
const error = ref<string | null>(null)

// --- Detail view ---
const detailFile = ref<NormalizedDriveFile | null>(null)
const deleting = ref(false)
const deleteError = ref<string | null>(null)

async function fetchDrive(folderId?: string | null) {
  if (!props.column.accountId) return
  const targetFolderId = folderId ?? currentFolderId.value
  loading.value = true
  error.value = null

  try {
    const [folderResult, fileResult] = await Promise.all([
      invoke<DriveFolder[]>('api_request', {
        accountId: props.column.accountId,
        endpoint: 'drive/folders',
        params: { folderId: targetFolderId, limit: 50 },
      }),
      invoke<NormalizedDriveFile[]>('api_request', {
        accountId: props.column.accountId,
        endpoint: 'drive/files',
        params: { folderId: targetFolderId, limit: 50 },
      }),
    ])
    folders.value = folderResult
    files.value = fileResult
  } catch (e) {
    error.value = AppError.from(e).message
  } finally {
    loading.value = false
  }
}

function openFolder(folder: DriveFolder) {
  folderStack.value.push(folder)
  currentFolderId.value = folder.id
  detailFile.value = null
  fetchDrive(folder.id)
}

function goUp() {
  if (detailFile.value) {
    detailFile.value = null
    deleteError.value = null
    return
  }
  folderStack.value.pop()
  const parent = folderStack.value[folderStack.value.length - 1]
  currentFolderId.value = parent?.id ?? null
  fetchDrive(currentFolderId.value)
}

function goRoot() {
  folderStack.value = []
  currentFolderId.value = null
  detailFile.value = null
  deleteError.value = null
  fetchDrive(null)
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
    files.value = files.value.filter((f) => f.id !== detailFile.value!.id)
    detailFile.value = null
  } catch (e) {
    deleteError.value = AppError.from(e).message
  } finally {
    deleting.value = false
  }
}

function safeUrl(url: string | null | undefined): string | undefined {
  if (!url) return undefined
  return isSafeUrl(url) ? url : undefined
}

function isImage(file: NormalizedDriveFile): boolean {
  return file.type.startsWith('image/')
}

function isVideo(file: NormalizedDriveFile): boolean {
  return file.type.startsWith('video/')
}

function isAudio(file: NormalizedDriveFile): boolean {
  return file.type.startsWith('audio/')
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`
}

const canGoUp = computed(() => {
  return detailFile.value !== null || folderStack.value.length > 0
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
      <button v-if="!detailFile" class="_button header-refresh" title="更新" :disabled="loading" @click.stop="fetchDrive()">
        <i class="ti ti-refresh" :class="{ spin: loading }" />
      </button>
      <div v-if="account" class="header-account">
        <img v-if="account.avatarUrl" :src="account.avatarUrl" class="header-avatar" />
      </div>
    </template>

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
              <span>{{ formatSize(detailFile.size) }}</span>
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
        <div v-else-if="folders.length === 0 && files.length === 0" class="column-empty">
          ファイルがありません
        </div>
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
          <div v-if="files.length > 0" class="drive-grid">
            <button
              v-for="file in files"
              :key="file.id"
              class="_button drive-grid-cell"
              @click="openDetail(file)"
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
              </div>
              <div class="drive-grid-label">{{ file.name }}</div>
            </button>
          </div>
        </template>
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
  transition: background 0.15s;
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
  transition: background 0.15s;
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
  transition: opacity 0.15s;
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
  background: rgba(0, 0, 0, 0.6);
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
  border-radius: 8px;
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
  border-radius: 8px;
  background: color-mix(in srgb, var(--nd-love) 15%, transparent);
  color: var(--nd-love);
  font-size: 0.85em;
  font-weight: 600;
  transition: background 0.15s;
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
</style>
