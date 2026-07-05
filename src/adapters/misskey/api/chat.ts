import { commands } from '@/utils/tauriInvoke'
import type { ChatApi, ChatMessage, PaginationOptions } from '../../types'
import { type MisskeyApiContext, unwrapAny } from './context'

// 書込 (apiCreateChatMessage) と DB キャッシュ (apiGetCachedChat*) は Misskey
// 専用機能の例外として commands.* 直呼び (DeckChatColumn / useChatThreadPrefetch)。
// adapter 経由なのは read 系 3 メソッドのみ。
export function createChatApi(ctx: MisskeyApiContext): ChatApi {
  return {
    async getChatHistory(
      limit?: number,
      cache?: boolean | null,
    ): Promise<ChatMessage[]> {
      return unwrapAny(
        await commands.apiGetChatHistory(
          ctx.accountId,
          limit ?? 100,
          null,
          cache ?? null,
        ),
      )
    },

    async getChatUserMessages(
      userId: string,
      options: PaginationOptions & { cache?: boolean | null } = {},
    ): Promise<ChatMessage[]> {
      return unwrapAny(
        await commands.apiGetChatUserMessages(
          ctx.accountId,
          userId,
          options.limit ?? 30,
          options.sinceId ?? null,
          options.untilId ?? null,
          options.cache ?? null,
        ),
      )
    },

    async getChatRoomMessages(
      roomId: string,
      options: PaginationOptions & { cache?: boolean | null } = {},
    ): Promise<ChatMessage[]> {
      return unwrapAny(
        await commands.apiGetChatRoomMessages(
          ctx.accountId,
          roomId,
          options.limit ?? 30,
          options.sinceId ?? null,
          options.untilId ?? null,
          options.cache ?? null,
        ),
      )
    },
  }
}
