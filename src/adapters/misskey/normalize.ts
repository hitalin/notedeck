import type { DriveFile, Note, UserLite } from 'misskey-js/entities.js'
import type {
  NormalizedDriveFile,
  NormalizedNote,
  NormalizedUser,
  NormalizedUserDetail,
} from '../types'

export function normalizeNote(
  note: Note,
  accountId: string,
  serverHost: string,
): NormalizedNote {
  return {
    id: note.id,
    _accountId: accountId,
    _serverHost: serverHost,
    createdAt: note.createdAt,
    text: note.text,
    cw: note.cw ?? null,
    user: normalizeUser(note.user),
    visibility: note.visibility,
    emojis: note.emojis ?? {},
    reactionEmojis: note.reactionEmojis ?? {},
    reactions: note.reactions,
    myReaction: note.myReaction ?? null,
    renoteCount: note.renoteCount,
    repliesCount: note.repliesCount,
    files: (note.files ?? []).map(normalizeDriveFile),
    reply: note.reply
      ? normalizeNote(note.reply, accountId, serverHost)
      : undefined,
    renote: note.renote
      ? normalizeNote(note.renote, accountId, serverHost)
      : undefined,
  }
}

export function normalizeUser(user: UserLite): NormalizedUser {
  return {
    id: user.id,
    username: user.username,
    host: user.host ?? null,
    name: user.name ?? null,
    avatarUrl: user.avatarUrl ?? null,
  }
}

export function normalizeUserDetail(user: Record<string, unknown>): NormalizedUserDetail {
  return {
    id: user.id as string,
    username: user.username as string,
    host: (user.host as string) ?? null,
    name: (user.name as string) ?? null,
    avatarUrl: (user.avatarUrl as string) ?? null,
    bannerUrl: (user.bannerUrl as string) ?? null,
    description: (user.description as string) ?? null,
    followersCount: (user.followersCount as number) ?? 0,
    followingCount: (user.followingCount as number) ?? 0,
    notesCount: (user.notesCount as number) ?? 0,
    isBot: (user.isBot as boolean) ?? false,
    isCat: (user.isCat as boolean) ?? false,
    isFollowing: (user.isFollowing as boolean) ?? false,
    isFollowed: (user.isFollowed as boolean) ?? false,
    createdAt: (user.createdAt as string) ?? '',
  }
}

function normalizeDriveFile(file: DriveFile): NormalizedDriveFile {
  return {
    id: file.id,
    name: file.name,
    type: file.type,
    url: file.url,
    thumbnailUrl: file.thumbnailUrl,
    size: file.size,
    isSensitive: file.isSensitive,
  }
}
