/**
 * AI セッションの自動タイトル生成。最初のユーザー発話から決定論的に短い
 * タイトル文字列を作る。AI で要約させる UI を後で入れる余地を残すため、
 * 純粋関数として切り出してある。
 */

const MAX_TITLE_LEN = 40
const MIN_MEANINGFUL_LEN = 4

/** ユーザー発話の整形: コードブロック・URL を除去して 1 行に圧縮する。 */
function normalize(text: string): string {
  return text
    .replace(/```[\s\S]*?```/g, '') // ``` ... ``` ブロック
    .replace(/`[^`]*`/g, '') // インラインコード
    .replace(/https?:\/\/\S+/g, '') // URL
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * 日時フォールバックタイトル。`<YYYY-MM-DD HH:mm> のチャット` 形式。
 * 同日に複数のセッションがあっても分単位で識別できる
 * （秒精度はファイル名 (Zettelkasten) 側で担保しているのでここは分まで）。
 */
function fallbackTitle(now: Date): string {
  const pad = (n: number) => n.toString().padStart(2, '0')
  const y = now.getFullYear()
  const m = pad(now.getMonth() + 1)
  const d = pad(now.getDate())
  const hh = pad(now.getHours())
  const mm = pad(now.getMinutes())
  return `${y}-${m}-${d} ${hh}:${mm} のチャット`
}

/**
 * ユーザー発話を整形してタイトルを返す。整形後 4 文字未満なら日付フォールバック。
 */
export function generateSessionTitle(
  firstUserMessage: string,
  now: Date = new Date(),
): string {
  const normalized = normalize(firstUserMessage)
  if (normalized.length < MIN_MEANINGFUL_LEN) {
    return fallbackTitle(now)
  }
  if (normalized.length <= MAX_TITLE_LEN) {
    return normalized
  }
  return normalized.slice(0, MAX_TITLE_LEN)
}
