import { invoke } from '@tauri-apps/api/core'
import { populateOgpCache } from '@/composables/useOgpPreview'
import type { OgpData } from '@/utils/ogp'
import type {
  Antenna,
  ApiAdapter,
  Channel,
  ChatMessage,
  Clip,
  CreateNoteParams,
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
} from '../types'

interface TimelineEnriched {
  notes: NormalizedNote[]
  ogp_hints: Record<string, OgpData>
}

export class MisskeyApi implements ApiAdapter {
  private accountId: string

  constructor(accountId: string) {
    this.accountId = accountId
  }

  async getTimeline(
    type: TimelineType,
    options: TimelineOptions = {},
  ): Promise<NormalizedNote[]> {
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
    return invoke('api_create_reaction', {
      accountId: this.accountId,
      noteId,
      reaction,
    })
  }

  async deleteReaction(noteId: string): Promise<void> {
    return invoke('api_delete_reaction', {
      accountId: this.accountId,
      noteId,
    })
  }

  async getNoteReactions(
    noteId: string,
    reactionType?: string,
    limit?: number,
  ): Promise<NoteReaction[]> {
    return invoke('api_get_note_reactions', {
      accountId: this.accountId,
      noteId,
      reactionType: reactionType ?? null,
      limit: limit ?? null,
    })
  }

  async updateNote(noteId: string, params: CreateNoteParams): Promise<void> {
    return invoke('api_update_note', {
      accountId: this.accountId,
      noteId,
      params,
    })
  }

  async deleteNote(noteId: string): Promise<void> {
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
    return invoke('api_upload_file', {
      accountId: this.accountId,
      fileName,
      fileData,
      contentType,
      isSensitive,
    })
  }

  async createFavorite(noteId: string): Promise<void> {
    return invoke('api_create_favorite', {
      accountId: this.accountId,
      noteId,
    })
  }

  async deleteFavorite(noteId: string): Promise<void> {
    return invoke('api_delete_favorite', {
      accountId: this.accountId,
      noteId,
    })
  }

  async pinNote(noteId: string): Promise<void> {
    await invoke('api_request', {
      accountId: this.accountId,
      endpoint: 'i/pin',
      params: { noteId },
    })
  }

  async unpinNote(noteId: string): Promise<void> {
    await invoke('api_request', {
      accountId: this.accountId,
      endpoint: 'i/unpin',
      params: { noteId },
    })
  }

  async getUserPinnedNoteIds(userId: string): Promise<string[]> {
    const result = await invoke<{ pinnedNoteIds?: string[] }>('api_request', {
      accountId: this.accountId,
      endpoint: 'users/show',
      params: { userId },
    })
    return result.pinnedNoteIds ?? []
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
    const filters: Record<string, boolean> = {}
    if (withReplies != null) filters.withReplies = withReplies
    if (withFiles != null) filters.withFiles = withFiles
    if (withChannelNotes != null) filters.withChannelNotes = withChannelNotes
    return invoke('api_get_user_notes', {
      accountId: this.accountId,
      userId,
      options: {
        limit: pagination.limit ?? 20,
        sinceId: pagination.sinceId ?? null,
        untilId: pagination.untilId ?? null,
        filters: Object.keys(filters).length > 0 ? filters : null,
      },
    })
  }

  async getUserFeaturedNotes(
    userId: string,
    options: PaginationOptions = {},
  ): Promise<NormalizedNote[]> {
    try {
      const raw = await invoke<{ id: string }[]>('api_request', {
        accountId: this.accountId,
        endpoint: 'users/featured-notes',
        params: {
          userId,
          limit: options.limit ?? 30,
          untilId: options.untilId ?? undefined,
        },
      })
      if (!raw.length) return []
      return Promise.all(raw.map((n) => this.getNote(n.id)))
    } catch {
      return this.getUserNotes(userId, { limit: options.limit ?? 20 })
    }
  }

  async createNote(params: CreateNoteParams): Promise<NormalizedNote> {
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
    return invoke('api_follow_user', {
      accountId: this.accountId,
      userId,
    })
  }

  async unfollowUser(userId: string): Promise<void> {
    return invoke('api_unfollow_user', {
      accountId: this.accountId,
      userId,
    })
  }

  async acceptFollowRequest(userId: string): Promise<void> {
    return invoke('api_accept_follow_request', {
      accountId: this.accountId,
      userId,
    })
  }

  async rejectFollowRequest(userId: string): Promise<void> {
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
    return invoke('api_create_chat_message', {
      accountId: this.accountId,
      userId: params.userId ?? null,
      roomId: params.roomId ?? null,
      text: params.text,
    })
  }
}
