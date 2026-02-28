/** Returns true only for http: and https: URLs. Blocks javascript:, data:, etc. */
export function isSafeUrl(url: string): boolean {
  try {
    const u = new URL(url)
    return u.protocol === 'http:' || u.protocol === 'https:'
  } catch {
    return false
  }
}

/** Sanitize a URL for use in CSS url(). Returns 'none' for invalid/unsafe URLs. */
export function safeCssUrl(url: string | null | undefined): string {
  if (!url) return 'none'
  try {
    const u = new URL(url)
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return 'none'
    const safe = u.href.replace(/[()'"\\]/g, (c) => `\\${c}`)
    return `url(${safe})`
  } catch {
    return 'none'
  }
}
