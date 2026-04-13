export interface VSCodeSnippet {
  prefix: string | string[]
  body: string | string[]
  description?: string
  scope?: string
}

export type SnippetFile = Record<string, VSCodeSnippet>

export interface ParsedSnippet {
  name: string
  prefix: string
  body: string
  description?: string
  source: string
}
