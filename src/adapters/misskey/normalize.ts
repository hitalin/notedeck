import type { DriveFile, Note, UserLite } from 'misskey-js/entities.js'
import type {
  NormalizedDriveFile,
  NormalizedNote,
  NormalizedUser,
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
