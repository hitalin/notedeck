import { ref } from 'vue'

/**
 * Recursively mask sensitive keys in a JSON-like value.
 * Keys in the denylist are replaced with `'<hidden>'`.
 */
export function maskSensitive(
  value: unknown,
  keys: ReadonlySet<string>,
): unknown {
  if (Array.isArray(value)) return value.map((v) => maskSensitive(v, keys))
  if (value && typeof value === 'object') {
    const result: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      result[k] = keys.has(k) ? '<hidden>' : maskSensitive(v, keys)
    }
    return result
  }
  return value
}

/**
 * Composable for sensitive-key masking with a reveal toggle.
 *
 * - `showSensitive`: reactive flag (default `false`)
 * - `formatJson(value)`: returns pretty-printed JSON with masking applied
 *   according to `showSensitive`
 */
export function useSensitiveMask(sensitiveKeys: ReadonlySet<string>) {
  const showSensitive = ref(false)

  function formatJson(value: unknown): string {
    if (value == null) return ''
    const obj = showSensitive.value
      ? value
      : maskSensitive(value, sensitiveKeys)
    return JSON.stringify(obj, null, 2)
  }

  return { showSensitive, formatJson }
}
