/**
 * Capability id (= ドット区切り `notes.read`) と AI tool name (= Anthropic
 * / OpenAI で許可される `^[a-zA-Z0-9_-]{1,128}$`) の相互変換。
 *
 * 両 provider とも tool name にドットを許可しないため、`.` を `_` に
 * 置換する 1 対 1 マッピングを使う。逆引きは registry の listCapabilities()
 * を walk して `sanitizeToolName(cap.id) === name` で照合する想定。
 */

export function sanitizeToolName(id: string): string {
  return id.replace(/\./g, '_')
}
