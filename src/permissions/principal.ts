/**
 * Principal — capability を「誰が」実行しようとしているか (#712)。
 *
 * dispatcher は principal を明示引数として受け取り、権限解決・確認ダイアログの
 * 帰属表示・Spotlight の帰属ラベルすべてに同じ値を流す。従来の
 * 「呼び出し側が permissions セットをすり替えて渡す」暗黙表現を置換する。
 */

export type Principal =
  /** ユーザー本人の直接操作 (権限プロファイルを持たず常時許可) */
  | { kind: 'user' }
  /** AI tool calling (chat / command / task セッション) */
  | { kind: 'ai.chat' }
  /** HEARTBEAT daemon の tick 実行 */
  | { kind: 'ai.heartbeat' }
  /**
   * AiScript プラグイン / ウィジェット。pluginId は必須 (帰属表示と将来の
   * per-plugin scope の resolve seam)。ウィジェットは `widget:<id>` 形式。
   */
  | { kind: 'plugin'; pluginId: string }
  /**
   * HTTP API (port 19820) の永続トークン経路。tokenId は将来の per-token
   * scope PR で配管する (型にだけ存在、現状は未使用)。
   */
  | { kind: 'external'; tokenId?: string }

/** 権限プロファイルを持つ principal (user は常時フル、プロファイル不要) */
export type ProfiledPrincipalId =
  | 'ai.chat'
  | 'ai.heartbeat'
  | 'plugin'
  | 'external'

/**
 * 確認ダイアログ / Spotlight の帰属表示に使う actor ラベル。
 * user は null (本人操作に帰属表示は不要)。
 *
 * ai.chat と ai.heartbeat は必ず別ラベルにする — 無人 daemon の確認モーダルが
 * 本人のチャット指示への確認と誤認される同意すり替えを防ぐ (#712 §3.3)。
 */
export function principalActorLabel(principal: Principal): string | null {
  switch (principal.kind) {
    case 'user':
      return null
    case 'ai.chat':
      return 'AI'
    case 'ai.heartbeat':
      return 'HEARTBEAT'
    case 'plugin': {
      const widgetId = principal.pluginId.startsWith('widget:')
        ? principal.pluginId.slice('widget:'.length)
        : null
      return widgetId !== null
        ? `ウィジェット「${widgetId}」`
        : `プラグイン「${principal.pluginId}」`
    }
    case 'external':
      return '外部アプリ'
  }
}
