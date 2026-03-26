import { populateOgpCache } from '@/composables/useOgpPreview'
import { AppError } from '@/utils/errors'
import type { OgpData } from '@/utils/ogp'
import { invoke } from '@/utils/tauriInvoke'
import type {
  Antenna,
  ApiAdapter,
  Channel,
  ChatMessage,
  Clip,
  CreateNoteParams,
  FollowRelation,
  NormalizedDriveFile,
  NormalizedNote,
  NormalizedNotification,
  NormalizedUser,
  NormalizedUserDetail,
  NoteReaction,
  PaginationOptions,
  SearchOptions,
  ServerEmoji,
  TimelineOptions,
  TimelineType,
  UserList,
  UserNotesOptions,
  UserRelation,
} from '../types'

interface TimelineEnriched {
  notes: NormalizedNote[]
  ogp_hints: Record<string, OgpData>
}

export class MisskeyApi implements ApiAdapter {
  private accountId: string
  private hasToken: boolean

  constructor(accountId: string, _host: string, hasToken = true) {
    this.accountId = accountId
    this.hasToken = hasToken
  }

  private requireAuth(): void {
    if (!this.hasToken) throw new AppError('AUTH', 'ログインが必要です')
  }

  async getTimeline(
    type: TimelineType,
    options: TimelineOptions = {},
  ): Promise<NormalizedNote[]> {
    if (!this.hasToken) {
      return invoke('api_get_timeline', {
        accountId: this.accountId,
        timelineType: type,
        options: {
          limit: options.limit ?? 20,
          sinceId: options.sinceId ?? null,
          untilId: options.untilId ?? null,
          filters: options.filters ?? null,
          listId: options.listId ?? null,
        },
      })
    }
    const result = await invoke<TimelineEnriched>('api_get_timeline_enriched', {
      accountId: this.accountId,
      timelineType: type,
      options: {
        limit: options.limit ?? 20,
        sinceId: options.sinceId ?? null,
        untilId: options.untilId ?? null,
        filters: options.filters ?? null,
        listId: options.listId ?? null,
      },
    })
    if (result.ogp_hints && Object.keys(result.ogp_hints).length > 0) {
      populateOgpCache(result.ogp_hints)
    }
    return result.notes
  }

  async getNote(noteId: string): Promise<NormalizedNote> {
    return invoke('api_get_note', {
      accountId: this.accountId,
      noteId,
    })
  }

  async createReaction(noteId: string, reaction: string): Promise<void> {
    this.requireAuth()
    return invoke('api_create_reaction', {
      accountId: this.accountId,
      noteId,
      reaction,
    })
  }

  async deleteReaction(noteId: string): Promise<void> {
    this.requireAuth()
    return invoke('api_delete_reaction', {
      accountId: this.accountId,
      noteId,
    })
  }

  async getNoteReactions(
    noteId: string,
    reactionType?: string,
    limit?: number,
    untilId?: string,
  ): Promise<NoteReaction[]> {
    return invoke('api_get_note_reactions', {
      accountId: this.accountId,
      noteId,
      reactionType: reactionType ?? null,
      limit: limit ?? null,
      untilId: untilId ?? null,
    })
  }

  async updateNote(noteId: string, params: CreateNoteParams): Promise<void> {
    this.requireAuth()
    return invoke('api_update_note', {
      accountId: this.accountId,
      noteId,
      params,
    })
  }

  async deleteNote(noteId: string): Promise<void> {
    this.requireAuth()
    return invoke('api_delete_note', {
      accountId: this.accountId,
      noteId,
    })
  }

  async uploadFile(
    fileName: string,
    fileData: number[],
    contentType: string,
    isSensitive = false,
  ): Promise<NormalizedDriveFile> {
    this.requireAuth()
    return invoke('api_upload_file', {
      accountId: this.accountId,
      fileName,
      fileData,
      contentType,
      isSensitive,
    })
  }

  async uploadFileFromPath(
    filePath: string,
    isSensitive = false,
  ): Promise<NormalizedDriveFile> {
    this.requireAuth()
    return invoke('api_upload_file_from_path', {
      accountId: this.accountId,
      filePath,
      isSensitive,
    })
  }

  async createFavorite(noteId: string): Promise<void> {
    this.requireAuth()
    return invoke('api_create_favorite', {
      accountId: this.accountId,
      noteId,
    })
  }

  async deleteFavorite(noteId: string): Promise<void> {
    this.requireAuth()
    return invoke('api_delete_favorite', {
      accountId: this.accountId,
      noteId,
    })
  }

  async pinNote(noteId: string): Promise<void> {
    this.requireAuth()
    return invoke('api_pin_note', {
      accountId: this.accountId,
      noteId,
    })
  }

  async unpinNote(noteId: string): Promise<void> {
    this.requireAuth()
    return invoke('api_unpin_note', {
      accountId: this.accountId,
      noteId,
    })
  }

  async getUserPinnedNoteIds(userId: string): Promise<string[]> {
    return invoke('api_get_user_pinned_note_ids', {
      accountId: this.accountId,
      userId,
    })
  }

  async getUser(userId: string): Promise<NormalizedUser> {
    return invoke('api_get_user', {
      accountId: this.accountId,
      userId,
    })
  }

  async getUserDetail(userId: string): Promise<NormalizedUserDetail> {
    return invoke('api_get_user_detail', {
      accountId: this.accountId,
      userId,
    })
  }

  async getUserNotes(
    userId: string,
    options: UserNotesOptions = {},
  ): Promise<NormalizedNote[]> {
    const { withReplies, withFiles, withChannelNotes, ...pagination } = options
    const hasFilters =
      withReplies != null || withFiles != null || withChannelNotes != null

    if (hasFilters && this.hasToken) {
      const params: Record<string, unknown> = {
        userId,
        limit: pagination.limit ?? 20,
      }
      if (pagination.untilId) params.untilId = pagination.untilId
      if (pagination.sinceId) params.sinceId = pagination.sinceId
      if (withReplies != null) params.withReplies = withReplies
      if (withFiles != null) params.withFiles = withFiles
      if (withChannelNotes != null) params.withChannelNotes = withChannelNotes

      const raw = await invoke<{ id: string }[]>(
        'api_get_user_notes_filtered',
        {
          accountId: this.accountId,
          params,
        },
      )
      if (!raw.length) return []
      return Promise.all(raw.map((n) => this.getNote(n.id)))
    }

    return invoke('api_get_user_notes', {
      accountId: this.accountId,
      userId,
      options: {
        limit: pagination.limit ?? 20,
        sinceId: pagination.sinceId ?? null,
        untilId: pagination.untilId ?? null,
        filters: null,
      },
    })
  }

  async getUserFeaturedNotes(
    userId: string,
    options: PaginationOptions = {},
  ): Promise<NormalizedNote[]> {
    try {
      const raw = await invoke<{ id: string }[]>(
        'api_get_user_featured_notes',
        {
          accountId: this.accountId,
          userId,
          limit: options.limit ?? 30,
          untilId: options.untilId ?? null,
        },
      )
      if (!raw.length) return []
      return Promise.all(raw.map((n) => this.getNote(n.id)))
    } catch {
      return this.getUserNotes(userId, { limit: options.limit ?? 20 })
    }
  }

  async createNote(params: CreateNoteParams): Promise<NormalizedNote> {
    this.requireAuth()
    const { channelId, ...noteParams } = params
    return invoke('api_create_note', {
      accountId: this.accountId,
      params: noteParams,
      channelId: channelId ?? null,
    })
  }

  async getServerEmojis(): Promise<ServerEmoji[]> {
    return invoke('api_get_server_emojis', {
      accountId: this.accountId,
    })
  }

  async getPinnedReactions(): Promise<string[]> {
    return invoke('api_get_pinned_reactions', {
      accountId: this.accountId,
    })
  }

  async getNotifications(
    options: PaginationOptions = {},
  ): Promise<NormalizedNotification[]> {
    return invoke('api_get_notifications', {
      accountId: this.accountId,
      options: {
        limit: options.limit ?? 20,
        sinceId: options.sinceId ?? null,
        untilId: options.untilId ?? null,
      },
    })
  }

  async getNotificationsGrouped(
    options: PaginationOptions = {},
  ): Promise<NormalizedNotification[]> {
    return invoke('api_get_notifications_grouped', {
      accountId: this.accountId,
      options: {
        limit: options.limit ?? 20,
        sinceId: options.sinceId ?? null,
        untilId: options.untilId ?? null,
      },
    })
  }

  async searchNotes(
    query: string,
    options: SearchOptions = {},
  ): Promise<NormalizedNote[]> {
    return invoke('api_search_notes', {
      accountId: this.accountId,
      query,
      options: {
        limit: options.limit ?? 20,
        sinceId: options.sinceId ?? null,
        untilId: options.untilId ?? null,
        sinceDate: options.sinceDate ?? null,
        untilDate: options.untilDate ?? null,
      },
    })
  }

  async getNoteChildren(
    noteId: string,
    options: PaginationOptions = {},
  ): Promise<NormalizedNote[]> {
    return invoke('api_get_note_children', {
      accountId: this.accountId,
      noteId,
      limit: options.limit ?? 30,
    })
  }

  async getNoteRenotes(
    noteId: string,
    options: PaginationOptions = {},
  ): Promise<NormalizedNote[]> {
    return invoke('api_get_note_renotes', {
      accountId: this.accountId,
      noteId,
      limit: options.limit ?? 30,
    })
  }

  async getNoteConversation(
    noteId: string,
    options: PaginationOptions = {},
  ): Promise<NormalizedNote[]> {
    return invoke('api_get_note_conversation', {
      accountId: this.accountId,
      noteId,
      limit: options.limit ?? 30,
    })
  }

  async lookupUser(
    username: string,
    host?: string | null,
  ): Promise<NormalizedUser> {
    return invoke('api_lookup_user', {
      accountId: this.accountId,
      username,
      host: host ?? null,
    })
  }

  async followUser(userId: string): Promise<void> {
    this.requireAuth()
    return invoke('api_follow_user', {
      accountId: this.accountId,
      userId,
    })
  }

  async unfollowUser(userId: string): Promise<void> {
    this.requireAuth()
    return invoke('api_unfollow_user', {
      accountId: this.accountId,
      userId,
    })
  }

  async acceptFollowRequest(userId: string): Promise<void> {
    this.requireAuth()
    return invoke('api_accept_follow_request', {
      accountId: this.accountId,
      userId,
    })
  }

  async rejectFollowRequest(userId: string): Promise<void> {
    this.requireAuth()
    return invoke('api_reject_follow_request', {
      accountId: this.accountId,
      userId,
    })
  }

  async getUserLists(): Promise<UserList[]> {
    return invoke('api_get_user_lists', {
      accountId: this.accountId,
    })
  }

  async getAntennas(): Promise<Antenna[]> {
    return invoke('api_get_antennas', {
      accountId: this.accountId,
    })
  }

  async getAntennaNotes(
    antennaId: string,
    options: PaginationOptions = {},
  ): Promise<NormalizedNote[]> {
    return invoke('api_get_antenna_notes', {
      accountId: this.accountId,
      antennaId,
      limit: options.limit ?? 20,
      sinceId: options.sinceId ?? null,
      untilId: options.untilId ?? null,
    })
  }

  async getMentions(
    options: PaginationOptions & { visibility?: string } = {},
  ): Promise<NormalizedNote[]> {
    return invoke('api_get_mentions', {
      accountId: this.accountId,
      limit: options.limit ?? 20,
      sinceId: options.sinceId ?? null,
      untilId: options.untilId ?? null,
      visibility: options.visibility ?? null,
    })
  }

  async getFavorites(
    options: PaginationOptions = {},
  ): Promise<NormalizedNote[]> {
    return invoke('api_get_favorites', {
      accountId: this.accountId,
      limit: options.limit ?? 20,
      sinceId: options.sinceId ?? null,
      untilId: options.untilId ?? null,
    })
  }

  async getFeaturedNotes(
    options: { limit?: number } = {},
  ): Promise<NormalizedNote[]> {
    return invoke('api_get_featured_notes', {
      accountId: this.accountId,
      limit: options.limit ?? 30,
    })
  }

  async getClips(): Promise<Clip[]> {
    return invoke('api_get_clips', {
      accountId: this.accountId,
    })
  }

  async getClipNotes(
    clipId: string,
    options: PaginationOptions = {},
  ): Promise<NormalizedNote[]> {
    return invoke('api_get_clip_notes', {
      accountId: this.accountId,
      clipId,
      limit: options.limit ?? 20,
      sinceId: options.sinceId ?? null,
      untilId: options.untilId ?? null,
    })
  }

  async getChannels(): Promise<Channel[]> {
    return invoke('api_get_channels', {
      accountId: this.accountId,
    })
  }

  async getChannelNotes(
    channelId: string,
    options: PaginationOptions = {},
  ): Promise<NormalizedNote[]> {
    return invoke('api_get_channel_notes', {
      accountId: this.accountId,
      channelId,
      limit: options.limit ?? 20,
      sinceId: options.sinceId ?? null,
      untilId: options.untilId ?? null,
    })
  }

  async getChatHistory(limit?: number): Promise<ChatMessage[]> {
    return invoke('api_get_chat_history', {
      accountId: this.accountId,
      limit: limit ?? 100,
    })
  }

  async getChatUserMessages(
    userId: string,
    options: PaginationOptions = {},
  ): Promise<ChatMessage[]> {
    return invoke('api_get_chat_user_messages', {
      accountId: this.accountId,
      userId,
      limit: options.limit ?? 30,
      sinceId: options.sinceId ?? null,
      untilId: options.untilId ?? null,
    })
  }

  async getChatRoomMessages(
    roomId: string,
    options: PaginationOptions = {},
  ): Promise<ChatMessage[]> {
    return invoke('api_get_chat_room_messages', {
      accountId: this.accountId,
      roomId,
      limit: options.limit ?? 30,
      sinceId: options.sinceId ?? null,
      untilId: options.untilId ?? null,
    })
  }

  async createChatMessage(params: {
    userId?: string
    roomId?: string
    text: string
  }): Promise<ChatMessage> {
    this.requireAuth()
    return invoke('api_create_chat_message', {
      accountId: this.accountId,
      userId: params.userId ?? null,
      roomId: params.roomId ?? null,
      text: params.text,
    })
  }

  async muteUser(userId: string): Promise<void> {
    this.requireAuth()
    return invoke('api_mute_user', {
      accountId: this.accountId,
      userId,
    })
  }

  async unmuteUser(userId: string): Promise<void> {
    this.requireAuth()
    return invoke('api_unmute_user', {
      accountId: this.accountId,
      userId,
    })
  }

  async blockUser(userId: string): Promise<void> {
    this.requireAuth()
    return invoke('api_block_user', {
      accountId: this.accountId,
      userId,
    })
  }

  async unblockUser(userId: string): Promise<void> {
    this.requireAuth()
    return invoke('api_unblock_user', {
      accountId: this.accountId,
      userId,
    })
  }

  async reportUser(userId: string, comment: string): Promise<void> {
    this.requireAuth()
    return invoke('api_report_user', {
      accountId: this.accountId,
      userId,
      comment,
    })
  }

  async addNoteToClip(clipId: string, noteId: string): Promise<void> {
    this.requireAuth()
    return invoke('api_add_note_to_clip', {
      accountId: this.accountId,
      clipId,
      noteId,
    })
  }

  async addUserToList(listId: string, userId: string): Promise<void> {
    this.requireAuth()
    return invoke('api_add_user_to_list', {
      accountId: this.accountId,
      listId,
      userId,
    })
  }

  async removeUserFromList(listId: string, userId: string): Promise<void> {
    this.requireAuth()
    return invoke('api_remove_user_from_list', {
      accountId: this.accountId,
      listId,
      userId,
    })
  }

  async getFollowing(
    userId: string,
    options: { limit?: number; untilId?: string } = {},
  ): Promise<FollowRelation[]> {
    return invoke('api_get_following', {
      accountId: this.accountId,
      userId,
      limit: options.limit ?? 30,
      untilId: options.untilId ?? null,
    })
  }

  async getFollowers(
    userId: string,
    options: { limit?: number; untilId?: string } = {},
  ): Promise<FollowRelation[]> {
    return invoke('api_get_followers', {
      accountId: this.accountId,
      userId,
      limit: options.limit ?? 30,
      untilId: options.untilId ?? null,
    })
  }

  async getUserRelations(userIds: string[]): Promise<UserRelation[]> {
    return invoke('api_get_user_relations', {
      accountId: this.accountId,
      userIds,
    })
  }
}
