import { type Ref, ref } from 'vue'
import type { NormalizedDriveFile, ServerAdapter } from '@/adapters/types'
import { AppError } from '@/utils/errors'

export function useFileAttachment(
  getAdapter: () => ServerAdapter | null,
  fileInput: Ref<HTMLInputElement | null>,
  error: Ref<string | null>,
) {
  const attachedFiles = ref<NormalizedDriveFile[]>([])
  const isUploading = ref(false)

  function openFilePicker() {
    fileInput.value?.click()
  }

  async function onFileSelected(e: Event) {
    const input = e.target as HTMLInputElement
    const files = input.files
    const adapter = getAdapter()
    if (!files || !adapter) return

    isUploading.value = true
    error.value = null

    try {
      const uploadPromises = Array.from(files).map(async (file) => {
        const buffer = await file.arrayBuffer()
        const data = Array.from(new Uint8Array(buffer))
        return adapter.api.uploadFile(
          file.name,
          data,
          file.type || 'application/octet-stream',
        )
      })
      const uploaded = await Promise.all(uploadPromises)
      attachedFiles.value = [...attachedFiles.value, ...uploaded]
    } catch (e) {
      error.value = AppError.from(e).message
    } finally {
      isUploading.value = false
      input.value = ''
    }
  }

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
    openFilePicker,
    onFileSelected,
    uploadFilesFromPaths,
    attachDriveFiles,
    removeFile,
  }
}
