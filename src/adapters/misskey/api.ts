import type {
  ApiAdapter,
  CreateNoteParams,
  NormalizedNote,
  NormalizedNotification,
  NormalizedUser,
  PaginationOptions,
  TimelineOptions,
  TimelineType,
} from '../types'
import { normalizeNote, normalizeUser } from './normalize'

const TIMELINE_ENDPOINTS: Record<TimelineType, string> = {
  home: 'notes/timeline',
  local: 'notes/local-timeline',
  social: 'notes/hybrid-timeline',
  global: 'notes/global-timeline',
}

export class MisskeyApi implements ApiAdapter {
  private host: string
  private token: string
  private accountId: string

  constructor(host: string, token: string, accountId: string) {
    this.host = host
    this.token = token
    this.accountId = accountId
  }

  async request<T = unknown>(
    endpoint: string,
    params: Record<string, unknown> = {},
  ): Promise<T> {
    const res = await fetch(`https://${this.host}/api/${endpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...params, i: this.token }),
    })

    if (!res.ok) {
      let detail = ''
      try {
        const body = await res.json()
        detail = body?.error?.message || body?.error?.code || ''
      } catch {}
      const msg = detail
        ? `${endpoint}: ${detail}`
        : `${endpoint} (${res.status})`
      throw new Error(msg)
    }

    return res.json()
  }

  async getTimeline(
    type: TimelineType,
    options: TimelineOptions = {},
  ): Promise<NormalizedNote[]> {
    const endpoint = TIMELINE_ENDPOINTS[type]
    const params: Record<string, unknown> = {
      limit: options.limit ?? 20,
    }
    if (options.sinceId) params.sinceId = options.sinceId
    if (options.untilId) params.untilId = options.untilId

    const notes = await this.request<unknown[]>(endpoint, params)
    return notes.map((n) =>
      normalizeNote(n as never, this.accountId, this.host),
    )
  }

  async getNote(noteId: string): Promise<NormalizedNote> {
    const note = await this.request('notes/show', { noteId })
    return normalizeNote(note as never, this.accountId, this.host)
  }

  async createReaction(noteId: string, reaction: string): Promise<void> {
    await this.request('notes/reactions/create', { noteId, reaction })
  }

  async deleteReaction(noteId: string): Promise<void> {
    await this.request('notes/reactions/delete', { noteId })
  }

  async getUser(userId: string): Promise<NormalizedUser> {
    const user = await this.request('users/show', { userId })
    return normalizeUser(user as never)
  }

  async createNote(params: CreateNoteParams): Promise<NormalizedNote> {
    const body: Record<string, unknown> = {}
    if (params.text !== undefined) body.text = params.text
    if (params.cw !== undefined) body.cw = params.cw
    if (params.visibility) body.visibility = params.visibility
    if (params.replyId) body.replyId = params.replyId
    if (params.renoteId) body.renoteId = params.renoteId
    if (params.fileIds) body.fileIds = params.fileIds

    const result = await this.request<{ createdNote: unknown }>(
      'notes/create',
      body,
    )
    return normalizeNote(result.createdNote as never, this.accountId, this.host)
  }

  async getServerEmojis(): Promise<Record<string, string>> {
    const result = await this.request<{
      emojis: Array<{ name: string; url: string }>
    }>('emojis', {})
    const map: Record<string, string> = {}
    for (const e of result.emojis) {
      map[e.name] = e.url
    }
    return map
  }

  async getNotifications(
    options: PaginationOptions = {},
  ): Promise<NormalizedNotification[]> {
    const params: Record<string, unknown> = {
      limit: options.limit ?? 20,
    }
    if (options.sinceId) params.sinceId = options.sinceId
    if (options.untilId) params.untilId = options.untilId

    const notifications = await this.request<
      Array<{
        id: string
        createdAt: string
        type: string
        user?: unknown
        note?: unknown
        reaction?: string
      }>
    >('i/notifications', params)

    return notifications.map((n) => ({
      id: n.id,
      _accountId: this.accountId,
      _serverHost: this.host,
      createdAt: n.createdAt,
      type: n.type,
      user: n.user ? normalizeUser(n.user as never) : undefined,
      note: n.note
        ? normalizeNote(n.note as never, this.accountId, this.host)
        : undefined,
      reaction: n.reaction,
    }))
  }
}
