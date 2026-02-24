export type ServerSoftware = 'misskey' | 'unknown'

export interface ServerInfo {
  host: string
  software: ServerSoftware
  version: string
  features: ServerFeatures
}

export interface ServerFeatures {
  mastodonApi: boolean
  reactions: boolean
  customEmoji: boolean
  drive: boolean
  channels: boolean
  antennas: boolean
  quotes: boolean
  [key: string]: boolean
}

export type TimelineType = 'home' | 'local' | 'social' | 'global'

export interface TimelineOptions {
  limit?: number
  sinceId?: string
  untilId?: string
}

export interface PaginationOptions {
  limit?: number
  sinceId?: string
  untilId?: string
}

export interface NormalizedNote {
  id: string
  _accountId: string
  _serverHost: string
  createdAt: string
  text: string | null
  cw: string | null
  user: NormalizedUser
  visibility: 'public' | 'home' | 'followers' | 'specified'
  emojis: Record<string, string>
  reactionEmojis: Record<string, string>
  reactions: Record<string, number>
  myReaction?: string | null
  renoteCount: number
  repliesCount: number
  files: NormalizedDriveFile[]
  reply?: NormalizedNote
  renote?: NormalizedNote
}

export interface NormalizedUser {
  id: string
  username: string
  host: string | null
  name: string | null
  avatarUrl: string | null
}

export interface NormalizedUserDetail extends NormalizedUser {
  bannerUrl: string | null
  description: string | null
  followersCount: number
  followingCount: number
  notesCount: number
  isBot: boolean
  isCat: boolean
  isFollowing: boolean
  isFollowed: boolean
  createdAt: string
}

export interface NormalizedDriveFile {
  id: string
  name: string
  type: string
  url: string
  thumbnailUrl: string | null
  size: number
  isSensitive: boolean
}

export interface NormalizedNotification {
  id: string
  _accountId: string
  _serverHost: string
  createdAt: string
  type: string
  user?: NormalizedUser
  note?: NormalizedNote
  reaction?: string
}

export interface CreateNoteParams {
  text?: string
  cw?: string | null
  visibility?: 'public' | 'home' | 'followers' | 'specified'
  replyId?: string
  renoteId?: string
  fileIds?: string[]
}

export interface AuthSession {
  sessionId: string
  url: string
  host: string
}

export interface AuthResult {
  token: string
  user: NormalizedUser
}

export interface AuthAdapter {
  startAuth(host: string, permissions: string[]): Promise<AuthSession>
  completeAuth(session: AuthSession): Promise<AuthResult>
  verifyToken(host: string, token: string): Promise<NormalizedUser>
}

export interface ApiAdapter {
  request<T = unknown>(
    endpoint: string,
    params?: Record<string, unknown>,
  ): Promise<T>
  getTimeline(
    type: TimelineType,
    options?: TimelineOptions,
  ): Promise<NormalizedNote[]>
  getNote(noteId: string): Promise<NormalizedNote>
  createReaction(noteId: string, reaction: string): Promise<void>
  deleteReaction(noteId: string): Promise<void>
  getServerEmojis(): Promise<Record<string, string>>
  getUser(userId: string): Promise<NormalizedUser>
  getUserDetail(userId: string): Promise<NormalizedUserDetail>
  createNote(params: CreateNoteParams): Promise<NormalizedNote>
  getNotifications(
    options?: PaginationOptions,
  ): Promise<NormalizedNotification[]>
}

export type StreamConnectionState =
  | 'initializing'
  | 'connected'
  | 'reconnecting'
  | 'disconnected'

export interface ChannelSubscription {
  dispose(): void
}

export type MainChannelEvent = {
  type: string
  body: unknown
}

export interface StreamAdapter {
  connect(): void
  disconnect(): void
  subscribeTimeline(
    type: TimelineType,
    handler: (note: NormalizedNote) => void,
  ): ChannelSubscription
  subscribeMain(handler: (event: MainChannelEvent) => void): ChannelSubscription
  readonly state: StreamConnectionState
  on(
    event: 'connected' | 'disconnected' | 'reconnecting',
    handler: () => void,
  ): void
  off(event: string, handler: () => void): void
}

export interface ServerAdapter {
  readonly serverInfo: ServerInfo
  readonly auth: AuthAdapter
  readonly api: ApiAdapter
  readonly stream: StreamAdapter
}
