export interface ParsedNoteUrl {
  host: string
  noteId: string
}

// Misskey: https://{host}/notes/{noteId}
const misskeyNoteRe = /^https?:\/\/([^/]+)\/notes\/([a-zA-Z0-9]+)$/

// Mastodon: https://{host}/@{user}/{id}
const mastodonNoteRe = /^https?:\/\/([^/]+)\/@[^/]+\/(\d+)$/

export function parseNoteUrl(url: string): ParsedNoteUrl | null {
  let m = misskeyNoteRe.exec(url)
  if (m && m[1] && m[2]) return { host: m[1], noteId: m[2] }

  m = mastodonNoteRe.exec(url)
  if (m && m[1] && m[2]) return { host: m[1], noteId: m[2] }

  return null
}
