import { commands } from '@/utils/tauriInvoke'
import type {
  NormalizedNotification,
  NotificationsApi,
  PaginationOptions,
} from '../../types'
import { type MisskeyApiContext, unwrapAny } from './context'

export function createNotificationsApi(
  ctx: MisskeyApiContext,
): NotificationsApi {
  return {
    async getNotifications(
      options: PaginationOptions = {},
    ): Promise<NormalizedNotification[]> {
      return unwrapAny(
        await commands.apiGetNotifications(ctx.accountId, {
          limit: options.limit ?? 20,
          sinceId: options.sinceId ?? null,
          untilId: options.untilId ?? null,
        } as never),
      )
    },

    async getNotificationsGrouped(
      options: PaginationOptions = {},
    ): Promise<NormalizedNotification[]> {
      return unwrapAny(
        await commands.apiGetNotificationsGrouped(ctx.accountId, {
          limit: options.limit ?? 20,
          sinceId: options.sinceId ?? null,
          untilId: options.untilId ?? null,
        } as never),
      )
    },
  }
}
