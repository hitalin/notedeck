export type ServerSoftware =
  | 'misskey'
  | 'firefish'
  | 'sharkey'
  | 'iceshrimp'
  | 'unknown'

export interface ServerInfo {
  host: string
  software: ServerSoftware
  version: string
  features: ServerFeatures
  iconUrl?: string
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

/** Standard timeline types. Custom forks may add more (e.g., 'bubble', 'recommended'). */
export type TimelineType = string

export interface TimelineFilter {
  withRenotes?: boolean
  withReplies?: boolean
  withFiles?: boolean
  withBots?: boolean
  withSensitive?: boolean
}

/** Standard Misskey filter keys per timeline type */
export const TIMELINE_FILTER_KEYS: Record<
  TimelineType,
  (keyof TimelineFilter)[]
> = {
  home: ['withRenotes', 'withFiles'],
  local: ['withRenotes', 'withReplies', 'withFiles'],
  social: ['withRenotes', 'withReplies', 'withFiles'],
  global: ['withRenotes', 'withFiles'],
}

/** Fork-specific extra filter keys (merged with standard keys) */
export const FORK_EXTRA_FILTERS: Partial<
  Record<ServerSoftware, (keyof TimelineFilter)[]>
> = {
  firefish: ['withBots'],
  sharkey: ['withBots', 'withSensitive'],
  iceshrimp: ['withBots'],
}

export interface TimelineOptions {
  limit?: number
  sinceId?: string
  untilId?: string
  filters?: TimelineFilter
  listId?: string
}

export interface PaginationOptions {
  limit?: number
  sinceId?: string
  untilId?: string
}

export interface SearchOptions {
  limit?: number
  sinceId?: string
  untilId?: string
}

export interface UserList {
  id: string
  name: string
}

export interface Antenna {
  id: string
  name: string
}

export interface Clip {
  id: string
  name: string
}

export interface NormalizedNote {
  id: string
  _accountId: string
  _serverHost: string
  createdAt: string
  text: string | null
  cw: string | null
  user: NormalizedUser
  visibility: string
  emojis: Record<string, string>
  reactionEmojis: Record<string, string>
  reactions: Record<string, number>
  myReaction?: string | null
  renoteCount: number
  repliesCount: number
  files: NormalizedDriveFile[]
  poll?: NormalizedPoll
  replyId?: string | null
  renoteId?: string | null
  channelId?: string | null
  reactionAcceptance?: string | null
  uri?: string
  url?: string
  updatedAt?: string
  localOnly?: boolean
  isFavorited?: boolean
  /** Fork-specific mode flags (e.g., isNoteInYamiMode) */
  modeFlags?: Record<string, boolean>
  reply?: NormalizedNote
  renote?: NormalizedNote
}

export interface AvatarDecoration {
  id: string
  url: string
  angle?: number
  flipH?: boolean
  offsetX?: number
  offsetY?: number
}

export interface NormalizedUser {
  id: string
  username: string
  host: string | null
  name: string | null
  avatarUrl: string | null
  isBot?: boolean
  avatarDecorations?: AvatarDecoration[]
  emojis?: Record<string, string>
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

export interface NormalizedPoll {
  choices: NormalizedPollChoice[]
  multiple: boolean
  expiresAt: string | null
}

export interface NormalizedPollChoice {
  text: string
  votes: number
  isVoted: boolean
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

export interface NoteReaction {
  id: string
  createdAt: string
  user: NormalizedUser
  type: string
}

export interface NoteUpdateEvent {
  noteId: string
  type: 'reacted' | 'unreacted' | 'deleted' | 'pollVoted'
  body: {
    reaction?: string
    emoji?: string | null
    userId?: string
    deletedAt?: string
    choice?: number
  }
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
  visibility?: string
  localOnly?: boolean
  modeFlags?: Record<string, boolean>
  replyId?: string
  renoteId?: string
  fileIds?: string[]
}

export interface AuthSession {
  sessionId: string
  url: string
  host: string
}

export interface AuthAdapter {
  startAuth(host: string, permissions: string[]): Promise<AuthSession>
}

export interface ApiAdapter {
  getTimeline(
    type: TimelineType,
    options?: TimelineOptions,
  ): Promise<NormalizedNote[]>
  getNote(noteId: string): Promise<NormalizedNote>
  createReaction(noteId: string, reaction: string): Promise<void>
  deleteReaction(noteId: string): Promise<void>
  getNoteReactions(
    noteId: string,
    reactionType?: string,
    limit?: number,
  ): Promise<NoteReaction[]>
  updateNote(noteId: string, params: CreateNoteParams): Promise<void>
  deleteNote(noteId: string): Promise<void>
  createFavorite(noteId: string): Promise<void>
  deleteFavorite(noteId: string): Promise<void>
  uploadFile(
    fileName: string,
    fileData: number[],
    contentType: string,
    isSensitive?: boolean,
  ): Promise<NormalizedDriveFile>
  getServerEmojis(): Promise<Record<string, string>>
  getUser(userId: string): Promise<NormalizedUser>
  getUserDetail(userId: string): Promise<NormalizedUserDetail>
  getUserNotes(
    userId: string,
    options?: PaginationOptions,
  ): Promise<NormalizedNote[]>
  createNote(params: CreateNoteParams): Promise<NormalizedNote>
  getNotifications(
    options?: PaginationOptions,
  ): Promise<NormalizedNotification[]>
  searchNotes(query: string, options?: SearchOptions): Promise<NormalizedNote[]>
  getNoteChildren(
    noteId: string,
    options?: PaginationOptions,
  ): Promise<NormalizedNote[]>
  getNoteConversation(
    noteId: string,
    options?: PaginationOptions,
  ): Promise<NormalizedNote[]>
  lookupUser(username: string, host?: string | null): Promise<NormalizedUser>
  followUser(userId: string): Promise<void>
  unfollowUser(userId: string): Promise<void>
  getUserLists(): Promise<UserList[]>
  getAntennas(): Promise<Antenna[]>
  getAntennaNotes(
    antennaId: string,
    options?: PaginationOptions,
  ): Promise<NormalizedNote[]>
  getFavorites(options?: PaginationOptions): Promise<NormalizedNote[]>
  getClips(): Promise<Clip[]>
  getClipNotes(
    clipId: string,
    options?: PaginationOptions,
  ): Promise<NormalizedNote[]>
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
  /** Clean up local listeners/handlers without killing the shared WebSocket connection. */
  cleanup(): void
  subscribeTimeline(
    type: TimelineType,
    handler: (note: NormalizedNote) => void,
    options?: { onNoteUpdated?: (event: NoteUpdateEvent) => void; listId?: string },
  ): ChannelSubscription
  subscribeAntenna(
    antennaId: string,
    handler: (note: NormalizedNote) => void,
    options?: { onNoteUpdated?: (event: NoteUpdateEvent) => void },
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
