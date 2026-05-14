/**
 * Secret Vault (#564) の内蔵接続テンプレート。
 *
 * よく使う外部サービスの baseUrl / authType / allowedHosts を事前定義し、
 * ユーザーは secret を貼るだけで接続を作れるようにする。
 * テンプレ id は `builtin:<id>@<version>` 形式 — v2 で MisStore 配布の
 * `@<author>/<id>@<version>` 形式と名前空間を分離するための予約。
 */

import type { AuthType } from '@/bindings'

export interface ConnectionTemplate {
  /** `builtin:<id>@<version>` 形式の識別子。 */
  id: string
  /** 表示名。 */
  name: string
  /** tabler icon 名 (`ti ti-<icon>`)。 */
  icon: string
  /** デフォルト baseUrl。 */
  baseUrl: string
  /** デフォルト authType。 */
  authType: AuthType
  /** デフォルト allowedHosts。 */
  allowedHosts: string[]
  /** 疎通テストに使うパス (自分の身元を返すエンドポイント)。 */
  testPath: string
  /** secret 入力欄のラベル。 */
  secretLabel: string
  /** secret 発行手順への URL。 */
  secretHelpUrl: string
}

export const BUILTIN_TEMPLATES: ConnectionTemplate[] = [
  {
    id: 'builtin:github@1',
    name: 'GitHub',
    icon: 'brand-github',
    baseUrl: 'https://api.github.com',
    authType: { kind: 'bearer' },
    allowedHosts: ['api.github.com', 'uploads.github.com'],
    testPath: '/user',
    secretLabel: 'Personal Access Token',
    secretHelpUrl: 'https://github.com/settings/tokens',
  },
  {
    id: 'builtin:openai@1',
    name: 'OpenAI',
    icon: 'sparkles',
    baseUrl: 'https://api.openai.com',
    authType: { kind: 'bearer' },
    allowedHosts: ['api.openai.com'],
    testPath: '/v1/models',
    secretLabel: 'API Key',
    secretHelpUrl: 'https://platform.openai.com/api-keys',
  },
  {
    id: 'builtin:anthropic@1',
    name: 'Anthropic',
    icon: 'robot',
    baseUrl: 'https://api.anthropic.com',
    authType: { kind: 'header', name: 'x-api-key' },
    allowedHosts: ['api.anthropic.com'],
    testPath: '/v1/models',
    secretLabel: 'API Key',
    secretHelpUrl: 'https://console.anthropic.com/settings/keys',
  },
  {
    id: 'builtin:openrouter@1',
    name: 'OpenRouter',
    icon: 'router',
    baseUrl: 'https://openrouter.ai',
    authType: { kind: 'bearer' },
    allowedHosts: ['openrouter.ai'],
    testPath: '/api/v1/models',
    secretLabel: 'API Key',
    secretHelpUrl: 'https://openrouter.ai/keys',
  },
  {
    id: 'builtin:linear@1',
    name: 'Linear',
    icon: 'layout-kanban',
    baseUrl: 'https://api.linear.app',
    authType: { kind: 'header', name: 'Authorization' },
    allowedHosts: ['api.linear.app'],
    testPath: '/graphql',
    secretLabel: 'API Key',
    secretHelpUrl: 'https://linear.app/settings/api',
  },
  {
    id: 'builtin:slack@1',
    name: 'Slack',
    icon: 'brand-slack',
    baseUrl: 'https://slack.com',
    authType: { kind: 'bearer' },
    allowedHosts: ['slack.com'],
    testPath: '/api/auth.test',
    secretLabel: 'Bot / User OAuth Token',
    secretHelpUrl: 'https://api.slack.com/apps',
  },
]

/** 貼り付けられた URL の host から一致するテンプレートを探す。 */
export function matchTemplateByUrl(rawUrl: string): ConnectionTemplate | null {
  let host: string
  try {
    host = new URL(rawUrl).host.toLowerCase()
  } catch {
    return null
  }
  return (
    BUILTIN_TEMPLATES.find((t) =>
      t.allowedHosts.some((h) => h.toLowerCase() === host),
    ) ?? null
  )
}
