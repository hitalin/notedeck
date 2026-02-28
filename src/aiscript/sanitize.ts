/**
 * Strip invisible / zero-width characters that often sneak in from
 * web copy-paste and confuse the AiScript parser.
 */
export function sanitizeCode(code: string): string {
  return (
    code
      // BOM
      .replace(/\uFEFF/g, '')
      // Zero-width chars
      .replace(/\u200B|\u200C|\u200D|\u200E|\u200F|\u2060/g, '')
      // Non-breaking space → regular space
      .replace(/\u00A0/g, ' ')
      // Normalize line endings
      .replace(/\r\n/g, '\n')
      .replace(/\r/g, '\n')
  )
}
