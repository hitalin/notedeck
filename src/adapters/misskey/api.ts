import { invoke } from '@tauri-apps/api/core'
import type {
  ApiAdapter,
  CreateNoteParams,
  NormalizedDriveFile,
  NormalizedNote,
  NormalizedNotification,
  NormalizedUser,
  NormalizedUserDetail,
  NoteReaction,
  PaginationOptions,
  SearchOptions,
  TimelineOptions,
  TimelineType,
  Antenna,
  Channel,
  Clip,
  UserList,
} from '../types'

export class MisskeyApi implements ApiAdapter {
  private accountId: string

  constructor(accountId: string) {
    this.accountId = accountId
  }

  async getTimeline(
    type: TimelineType,
    options: TimelineOptions = {},
  ): Promise<NormalizedNote[]> {
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
    options: PaginationOptions = {},
  ): Promise<NormalizedNote[]> {
    return invoke('api_get_user_notes', {
      accountId: this.accountId,
      userId,
      options: {
        limit: options.limit ?? 20,
        sinceId: options.sinceId ?? null,
        untilId: options.untilId ?? null,
      },
    })
  }

  async createNote(params: CreateNoteParams): Promise<NormalizedNote> {
    return invoke('api_create_note', {
      accountId: this.accountId,
      params,
    })
  }

  async getServerEmojis(): Promise<Record<string, string>> {
    return invoke('api_get_server_emojis', {
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
    options: PaginationOptions = {},
  ): Promise<NormalizedNote[]> {
    return invoke('api_get_mentions', {
      accountId: this.accountId,
      limit: options.limit ?? 20,
      sinceId: options.sinceId ?? null,
      untilId: options.untilId ?? null,
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
}
