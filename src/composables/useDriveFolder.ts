import { computed, ref, shallowRef } from 'vue'
import type { DriveFolder, NormalizedDriveFile } from '@/adapters/types'
import { AppError, AUTH_ERROR_MESSAGE } from '@/utils/errors'
import { commands, unwrap } from '@/utils/tauriInvoke'
import { isSafeUrl } from '@/utils/url'

export interface UseDriveFolderOptions {
  accountId: () => string | undefined
  initialFolderId?: string | null
}

export function useDriveFolder(options: UseDriveFolderOptions) {
  const currentFolderId = ref<string | null>(options.initialFolderId ?? null)
  const folderStack = ref<DriveFolder[]>([])
  const folders = shallowRef<DriveFolder[]>([])
  const files = shallowRef<NormalizedDriveFile[]>([])
  const loading = ref(false)
  const error = ref<string | null>(null)

  async function fetchDrive(folderId?: string | null) {
    const accountId = options.accountId()
    if (!accountId) return
    const targetFolderId = folderId ?? currentFolderId.value
    loading.value = true
    error.value = null

    try {
      const [folderResult, fileResult] = await Promise.all([
        commands
          .apiGetDriveFolders(accountId, targetFolderId, 50)
          .then((r) => unwrap(r) as unknown as DriveFolder[]),
        commands
          .apiGetDriveFiles(accountId, targetFolderId, 50, null)
          .then((r) => unwrap(r) as unknown as NormalizedDriveFile[]),
      ])
      folders.value = folderResult
      files.value = fileResult
    } catch (e) {
      const appErr = AppError.from(e)
      error.value = appErr.isAuth ? AUTH_ERROR_MESSAGE : appErr.message
    } finally {
      loading.value = false
    }
  }

  function openFolder(folder: DriveFolder) {
    folderStack.value.push(folder)
    currentFolderId.value = folder.id
    fetchDrive(folder.id)
  }

  function goUp() {
    folderStack.value.pop()
    const parent = folderStack.value[folderStack.value.length - 1]
    currentFolderId.value = parent?.id ?? null
    fetchDrive(currentFolderId.value)
  }

  function goRoot() {
    folderStack.value = []
    currentFolderId.value = null
    fetchDrive(null)
  }

  // --- File selection ---
  const selectedIds = ref(new Set<string>())

  function toggleFile(fileId: string) {
    const next = new Set(selectedIds.value)
    if (next.has(fileId)) {
      next.delete(fileId)
    } else {
      next.add(fileId)
    }
    selectedIds.value = next
  }

  function selectAll() {
    selectedIds.value = new Set(files.value.map((f) => f.id))
  }

  function deselectAll() {
    selectedIds.value = new Set()
  }

  const selectedCount = computed(() => selectedIds.value.size)

  return {
    currentFolderId,
    folderStack,
    folders,
    files,
    loading,
    error,
    fetchDrive,
    openFolder,
    goUp,
    goRoot,
    selectedIds,
    toggleFile,
    selectAll,
    deselectAll,
    selectedCount,
  }
}

// --- Shared utility functions ---

export function safeUrl(url: string | null | undefined): string | undefined {
  if (!url) return undefined
  return isSafeUrl(url) ? url : undefined
}

export function isImage(file: NormalizedDriveFile): boolean {
  return file.type.startsWith('image/')
}

export function isVideo(file: NormalizedDriveFile): boolean {
  return file.type.startsWith('video/')
}

export function isAudio(file: NormalizedDriveFile): boolean {
  return file.type.startsWith('audio/')
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 * 1024 * 1024)
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`
}
