import { commands, unwrap } from '@/utils/tauriInvoke'
import type {
  ActiveUsersChart,
  ApRequestChart,
  ChartsApi,
  FederationChart,
  ServerDriveChart,
  ServerNotesChart,
  ServerUsersChart,
  UserFollowingChart,
  UserNotesChart,
  UserPvChart,
} from '../../types'
import type { MisskeyApiContext } from './context'

// chart 型は specta 生成の bindings と adapters/types.ts の re-export が一致
// するため、他ドメインと違い unwrapAny を要さずそのまま unwrap できる。
export function createChartsApi(ctx: MisskeyApiContext): ChartsApi {
  return {
    async getUserNotesChart(
      userId: string,
      span: 'day' | 'hour' = 'day',
      limit = 350,
    ): Promise<UserNotesChart> {
      return unwrap(
        await commands.apiChartsUserNotes(ctx.accountId, {
          userId,
          span,
          limit,
        }),
      )
    },

    async getUserFollowingChart(
      userId: string,
      span: 'day' | 'hour' = 'day',
      limit = 30,
    ): Promise<UserFollowingChart> {
      return unwrap(
        await commands.apiChartsUserFollowing(ctx.accountId, {
          userId,
          span,
          limit,
        }),
      )
    },

    async getUserPvChart(
      userId: string,
      span: 'day' | 'hour' = 'day',
      limit = 30,
    ): Promise<UserPvChart> {
      return unwrap(
        await commands.apiChartsUserPv(ctx.accountId, { userId, span, limit }),
      )
    },

    async getActiveUsersChart(
      span: 'day' | 'hour' = 'day',
      limit = 90,
    ): Promise<ActiveUsersChart> {
      return unwrap(
        await commands.apiChartsActiveUsers(ctx.accountId, { span, limit }),
      )
    },

    async getServerNotesChart(
      span: 'day' | 'hour' = 'day',
      limit = 90,
    ): Promise<ServerNotesChart> {
      return unwrap(
        await commands.apiChartsNotes(ctx.accountId, { span, limit }),
      )
    },

    async getServerUsersChart(
      span: 'day' | 'hour' = 'day',
      limit = 90,
    ): Promise<ServerUsersChart> {
      return unwrap(
        await commands.apiChartsUsers(ctx.accountId, { span, limit }),
      )
    },

    async getFederationChart(
      span: 'day' | 'hour' = 'day',
      limit = 90,
    ): Promise<FederationChart> {
      return unwrap(
        await commands.apiChartsFederation(ctx.accountId, { span, limit }),
      )
    },

    async getApRequestChart(
      span: 'day' | 'hour' = 'day',
      limit = 90,
    ): Promise<ApRequestChart> {
      return unwrap(
        await commands.apiChartsApRequest(ctx.accountId, { span, limit }),
      )
    },

    async getServerDriveChart(
      span: 'day' | 'hour' = 'day',
      limit = 90,
    ): Promise<ServerDriveChart> {
      return unwrap(
        await commands.apiChartsDrive(ctx.accountId, { span, limit }),
      )
    },
  }
}
