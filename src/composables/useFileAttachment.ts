import { ref } from 'vue'
import type { NormalizedDriveFile, ServerAdapter } from '@/adapters/types'
import { AppError } from '@/utils/errors'

export function useFileAttachment(
  getAdapter: () => ServerAdapter | null,
  error: { value: string | null },
) {
  const attachedFiles = ref<NormalizedDriveFile[]>([])
  const isUploading = ref(false)

  async function uploadFilesFromPaths(paths: string[]) {
    const adapter = getAdapter()
    if (!adapter || paths.length === 0) return

    isUploading.value = true
    error.value = null

    try {
      const uploadPromises = paths.map((path) =>
        adapter.api.uploadFileFromPath(path),
      )
      const uploaded = await Promise.all(uploadPromises)
      attachedFiles.value = [...attachedFiles.value, ...uploaded]
    } catch (e) {
      error.value = AppError.from(e).message
    } finally {
      isUploading.value = false
    }
  }

  function attachDriveFiles(driveFiles: NormalizedDriveFile[]) {
    attachedFiles.value = [...attachedFiles.value, ...driveFiles]
  }

  function removeFile(fileId: string) {
    attachedFiles.value = attachedFiles.value.filter((f) => f.id !== fileId)
  }

  return {
    attachedFiles,
    isUploading,
    uploadFilesFromPaths,
    attachDriveFiles,
    removeFile,
  }
}
