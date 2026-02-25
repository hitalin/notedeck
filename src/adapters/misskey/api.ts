import { invoke } from '@tauri-apps/api/core'
import type {
  ApiAdapter,
  CreateNoteParams,
  NormalizedNote,
  NormalizedNotification,
  NormalizedUser,
  NormalizedUserDetail,
  PaginationOptions,
  SearchOptions,
  TimelineOptions,
  TimelineType,
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
}
