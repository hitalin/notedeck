import type { NormalizedNote, TimelineFilter } from '@/adapters/types'

/**
 * ストリーミングで受信したノートがフィルター条件にマッチするか判定する。
 * REST API 側のフィルターを補完するクライアント側フィルタリング用。
 */
export function matchesFilter(
  note: NormalizedNote,
  filter?: TimelineFilter,
): boolean {
  if (!filter) return true

  // Renote のみ（引用なし）を除外
  if (filter.withRenotes === false && note.renote && !note.text) return false

  // リプライを除外
  if (filter.withReplies === false && note.reply) return false

  // ファイル付きのみ表示
  if (filter.withFiles === true) {
    const hasFiles =
      note.files.length > 0 || (note.renote?.files?.length ?? 0) > 0
    if (!hasFiles) return false
  }

  // Bot を除外
  if (filter.withBots === false && note.user.isBot) return false

  return true
}
