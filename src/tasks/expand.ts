export interface ExpandContext {
  inputs: Record<string, string>
  account: { id: string | null; host: string | null }
}

const TOKEN_RE = /\$\{([a-zA-Z0-9_.:-]+)\}/g

function resolveToken(token: string, ctx: ExpandContext): string {
  if (token.startsWith('input:')) {
    const key = token.slice('input:'.length)
    return ctx.inputs[key] ?? ''
  }
  if (token === 'account.id') return ctx.account.id ?? ''
  if (token === 'account.host') return ctx.account.host ?? ''
  return ''
}

function expandString(s: string, ctx: ExpandContext): string {
  return s.replace(TOKEN_RE, (_, token) => resolveToken(token, ctx))
}

export function expandTemplate<T>(value: T, ctx: ExpandContext): T {
  if (typeof value === 'string') {
    return expandString(value, ctx) as unknown as T
  }
  if (Array.isArray(value)) {
    return value.map((v) => expandTemplate(v, ctx)) as unknown as T
  }
  if (value !== null && typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(value)) {
      out[k] = expandTemplate(v, ctx)
    }
    return out as unknown as T
  }
  return value
}
