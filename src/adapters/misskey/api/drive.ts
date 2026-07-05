import { commands } from '@/utils/tauriInvoke'
import type { DriveApi, NormalizedDriveFile } from '../../types'
import { type MisskeyApiContext, unwrapAny } from './context'

export function createDriveApi(ctx: MisskeyApiContext): DriveApi {
  return {
    async uploadFile(
      fileName: string,
      fileData: number[],
      contentType: string,
      isSensitive = false,
      folderId: string | null = null,
    ): Promise<NormalizedDriveFile> {
      ctx.requireAuth()
      return unwrapAny(
        await commands.apiUploadFile(
          ctx.accountId,
          fileName,
          fileData,
          contentType,
          isSensitive,
          folderId,
        ),
      )
    },

    async uploadFileFromPath(
      filePath: string,
      isSensitive = false,
      folderId: string | null = null,
    ): Promise<NormalizedDriveFile> {
      ctx.requireAuth()
      return unwrapAny(
        await commands.apiUploadFileFromPath(
          ctx.accountId,
          filePath,
          isSensitive,
          folderId,
        ),
      )
    },
  }
}
