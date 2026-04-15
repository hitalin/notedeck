import type {
  NormalizedNote,
  NormalizedPoll,
  NoteVisibility,
} from '@/adapters/types'
import { type Account, getAccountAvatarUrl } from '@/stores/accounts'

export interface PreviewPollInput {
  choices: string[]
  multiple: boolean
  expiresAt: string | null
  show: boolean
}

export interface BuildPreviewNoteOptions {
  account: Account
  id: string
  createdAt: string
  text: string | null
  cw: string | null
  visibility: NoteVisibility
  localOnly: boolean
  replyId?: string | null
  renoteId?: string | null
  channelId?: string | null
  poll?: PreviewPollInput
  emojis?: Record<string, string>
  reactionEmojis?: Record<string, string>
}

function buildPoll(input: PreviewPollInput): NormalizedPoll | undefined {
  if (!input.show) return undefined
  const choices = input.choices
    .map((t) => t.trim())
    .filter((t) => t.length > 0)
    .map((text) => ({ text, votes: 0, isVoted: false }))
  if (choices.length < 2) return undefined
  return { choices, multiple: input.multiple, expiresAt: input.expiresAt }
}

/**
 * Synthesize a read-only NormalizedNote from form/memo state so MkNote can render
 * a preview. Attachments are intentionally omitted — previews show text, polls,
 * and custom emojis only.
 */
export function buildPreviewNote(
  opts: BuildPreviewNoteOptions,
): NormalizedNote {
  const { account } = opts
  const note: NormalizedNote = {
    id: opts.id,
    _accountId: account.id,
    _serverHost: account.host,
    createdAt: opts.createdAt,
    text: opts.text,
    cw: opts.cw,
    user: {
      id: account.userId,
      username: account.username,
      host: null,
      name: account.displayName,
      avatarUrl: getAccountAvatarUrl(account),
    },
    visibility: opts.visibility,
    emojis: opts.emojis ?? {},
    reactionEmojis: opts.reactionEmojis ?? {},
    reactions: {},
    renoteCount: 0,
    repliesCount: 0,
    files: [],
    localOnly: opts.localOnly,
    replyId: opts.replyId ?? null,
    renoteId: opts.renoteId ?? null,
    channelId: opts.channelId ?? null,
  }
  if (opts.poll) {
    const poll = buildPoll(opts.poll)
    if (poll) note.poll = poll
  }
  return note
}
