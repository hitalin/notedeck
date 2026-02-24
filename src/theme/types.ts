export interface MisskeyTheme {
  id: string
  name: string
  base?: 'light' | 'dark'
  props: Record<string, string>
}

export type CompiledProps = Record<string, string>

export interface ThemeSource {
  kind: 'builtin-dark' | 'builtin-light' | 'server-dark' | 'server-light'
  host?: string
  theme: MisskeyTheme
}
